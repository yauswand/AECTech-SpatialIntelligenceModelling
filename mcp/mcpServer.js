import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import sharp from 'sharp';

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

const DEFAULT_COLLECTION = "prod";
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
    // Match both singular and plural forms - expanded to include new properties
    const hasProperty = /\b(colors?|colours?|materials?|rooms?|locations?|areas?|dimensions?|sizes?|styles?|architectural\s+styles?|placements?|orientations?|design\s+styles?|functional\s+roles?|roles?|qualities?|conditions?|functions?|relationships?\s+to\s+space)\b/.test(lowerQuery);
    // Expanded object types to match specific_type values
    const hasObject = /\b(chairs?|desks?|tables?|sofas?|beds?|lamps?|cabinets?|shelves?|doors?|windows?|televisions?|tvs?|whiteboards?|boards?|monitors?|screens?|mirrors?|walls?|cans?|bottles?|tablets?|phones?|computers?|laptops?|papers?|books?|furniture|packets?|snacks?|popcorn|containers?|boxes?|bags?|items?|objects?)\b/.test(lowerQuery);
    
    // Also check for "tell me about", "what do you know about", "what is", "understand", etc. patterns
    // Use a more flexible pattern that doesn't rely on word boundaries for multi-word phrases
    const hasAboutPattern = /(tell\s+me\s+about|what\s+do\s+you\s+know\s+about|what\s+is|what\s+are|describe|what\s+can\s+you\s+tell\s+me\s+about|i\s+want\s+to\s+understand|understand|tell\s+me\s+more\s+about|explain|can\s+you\s+talk\s+to\s+me\s+about|can\s+you\s+tell\s+me\s+about|talk\s+to\s+me\s+about)/.test(lowerQuery);
    
    // Check for general info/understanding patterns that should always be info queries
    // These patterns indicate the user wants comprehensive information, not just a specific property
    const isGeneralInfoQuery = /(tell\s+me\s+about|what\s+do\s+you\s+know\s+about|i\s+want\s+to\s+understand|understand|tell\s+me\s+more|explain|describe|can\s+you\s+talk\s+to\s+me\s+about|can\s+you\s+tell\s+me\s+about|talk\s+to\s+me\s+about|can\s+you\s+tell|can\s+you\s+describe|can\s+you\s+explain|how\s+(big|large|small|wide|tall|long|much|many))/i.test(lowerQuery);
    
    // Check for queries about rooms/spaces/areas that should use vector search (info queries)
    // These are general information requests about spatial context, not specific property queries
    // Pattern: mentions area/space/room/location + context words (this/the/of) + info query pattern
    const isRoomOrSpaceQuery = /(area|space|room|location).*(this|the|of)/i.test(lowerQuery) && 
                                /(can\s+you\s+tell|tell\s+me|what|describe|explain|about|understand|how)/.test(lowerQuery);
    
    // If we have a general info query pattern, it's always an info query
    // (even if object type isn't explicitly listed, vector search will find it)
    // (even if a property is mentioned, it's context, not the query intent)
    if (isGeneralInfoQuery || isRoomOrSpaceQuery) {
        return { type: 'info', query };
    }
    
    // If we have any about pattern with an object (fallback for other patterns)
    if (hasAboutPattern && hasObject) {
        return { type: 'info', query };
    }
    
    // All other queries (including property queries) should use vector search
    // Property queries will be handled by extracting the property from vector search results
    // This ensures we use semantic search instead of string matching
    
    // List queries
    if (lowerQuery.match(/\b(list|all|show|what are|which)\b/)) {
        return { type: 'list', query };
    }
    
    // Default to info (vector search) - no more string matching/spatial queries
    // All queries should use semantic vector search through RAG
    return { type: 'info', query };
}

// Helper function to extract property from query
// Check more specific phrases first, then general terms
function extractProperty(query) {
    const lowerQuery = query.toLowerCase();
    // Check for specific multi-word properties first
    if (lowerQuery.includes('architectural style')) return 'architectural_style';
    if (lowerQuery.includes('design style')) return 'design_style';
    if (lowerQuery.includes('functional role')) return 'functional_role';
    if (lowerQuery.includes('relationship to space') || lowerQuery.includes('position in space')) return 'relationship_to_space';
    // Then check for single-word or general properties
    if (lowerQuery.includes('color') || lowerQuery.includes('colour')) return 'color';
    if (lowerQuery.includes('material')) return 'material';
    if (lowerQuery.includes('room') || lowerQuery.includes('location')) return 'room';
    if (lowerQuery.includes('area')) return 'area'; // Area is a spatial property
    if (lowerQuery.includes('dimension') || lowerQuery.includes('size')) return 'dimensions';
    if (lowerQuery.includes('style')) return 'architectural_style'; // Fallback for just "style"
    if (lowerQuery.includes('placement') || lowerQuery.includes('placed') || lowerQuery.includes('where')) return 'placement';
    if (lowerQuery.includes('orientation')) return 'orientation';
    if (lowerQuery.includes('role') && !lowerQuery.includes('functional role')) return 'functional_role';
    if (lowerQuery.includes('quality')) return 'quality';
    if (lowerQuery.includes('condition')) return 'condition';
    if (lowerQuery.includes('function') && !lowerQuery.includes('functional')) return 'primary_function';
    return null;
}

// Helper function to extract object type from query
// This now matches against specific_type, so it's more flexible
function extractObjectType(query) {
    const lowerQuery = query.toLowerCase();
    // Common object types - expanded list
    const objectTypes = [
        'chair', 'desk', 'table', 'sofa', 'bed', 'lamp', 'cabinet', 'shelf', 
        'door', 'window', 'television', 'tv', 'whiteboard', 'board', 
        'monitor', 'screen', 'mirror', 'wall', 'can', 'bottle', 'tablet',
        'phone', 'computer', 'laptop', 'paper', 'book', 'furniture',
        'packet', 'snack', 'popcorn', 'container', 'box', 'bag', 'item', 'object'
    ];
    
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
            const hasPluralProperty = /\b(colors|materials|dimensions|sizes|styles|placements)\b/.test(lowerQuery);
            const beforeMatch = lowerQuery.substring(0, lowerQuery.indexOf(objType));
            const afterMatch = lowerQuery.substring(lowerQuery.indexOf(objType) + objType.length);
            const hasPluralContext = /\b(are|all|the|what are|of the)\b/.test(beforeMatch);
            const hasPropertyAfter = /\b(colors?|materials?|dimensions?|sizes?|styles?|placements?)\b/.test(afterMatch);
            const isPlural = hasPluralProperty || hasPluralContext || hasPropertyAfter;
            return { type: objType, isPlural };
        }
    }
    return null;
}

// Helper functions to extract data from new JSON structure
function getObjectName(payload) {
    // Prioritize specific_type as it's more descriptive
    return payload.object_identification?.specific_type || payload.current_label || null;
}

function getColor(payload) {
    if (payload.material_finish?.color_palette && payload.material_finish.color_palette.length > 0) {
        return payload.material_finish.color_palette.join(', ');
    }
    return null;
}

function getMaterial(payload) {
    if (payload.material_finish?.primary_materials && payload.material_finish.primary_materials.length > 0) {
        return payload.material_finish.primary_materials.join(', ');
    }
    return null;
}

function getRoom(payload) {
    return payload.architectural_context?.typical_location || null;
}

function getDimensions(payload) {
    // New structure doesn't have direct dimensions, but we can use size_scale
    if (payload.spatial_analysis?.size_scale) {
        return payload.spatial_analysis.size_scale;
    }
    // Fallback to old structure if present
    if (payload.width !== undefined || payload.height !== undefined || payload.depth !== undefined) {
        const w = payload.width ?? '?';
        const h = payload.height ?? '?';
        const d = payload.depth ?? '?';
        return `${w}m × ${h}m × ${d}m`;
    }
    return null;
}

function getFrameId(payload) {
    return payload.frame_id || null;
}

function getArchitecturalStyle(payload) {
    return payload.architectural_context?.architectural_style || null;
}

function getPlacement(payload) {
    return payload.spatial_analysis?.placement || null;
}

function getOrientation(payload) {
    return payload.spatial_analysis?.orientation || null;
}

function getDesignStyle(payload) {
    return payload.style_design?.design_style || null;
}

function getFunctionalRole(payload) {
    return payload.architectural_context?.functional_role || null;
}

function getSizeScale(payload) {
    return payload.spatial_analysis?.size_scale || null;
}

function getRelationshipToSpace(payload) {
    return payload.spatial_analysis?.relationship_to_space || null;
}

function getQualityLevel(payload) {
    return payload.material_finish?.quality_level || null;
}

function getCondition(payload) {
    return payload.condition_maintenance?.visible_condition || null;
}

function getPrimaryFunction(payload) {
    return payload.functional_analysis?.primary_function || null;
}

// Register query tool
mcpServer.tool(
    "query_spatial_data",
    "Query spatial intelligence data using natural language. Can answer questions about objects (identified by specific_type like television, whiteboard, chair, etc.), their properties (color, material, room, dimensions, architectural style, placement, orientation, design style, functional role, quality, condition), counts, and lists. Supports both singular and plural queries. Examples: 'number of televisions', 'architectural style of the whiteboard', 'where is the chair placed', 'what is the placement of the desk', 'list all architectural styles', 'what objects are in the office'",
    {
        query: z.string().describe("Natural language query about the spatial data"),
        collection: z.string().optional().default(DEFAULT_COLLECTION).describe("Qdrant collection name to search"),
        limit: z.number().optional().default(20).describe("Maximum number of results to return"),
    },
    async (args) => {
        const { query, collection, limit } = args;
        
        console.error(`[RAG Query] Starting query: "${query}"`);
        console.error(`[RAG Query] Collection: ${collection}, Limit: ${limit}`);
        
        try {
            // Step 1: Analyze query intent
            const intent = analyzeQueryIntent(query);
            console.error(`[RAG Query] Intent Analysis - Type: ${intent.type}, Query: "${query}"`);
            
            // Debug: check what we detected
            if (intent.type === 'property') {
                const prop = extractProperty(query);
                const obj = extractObjectType(query);
                console.error(`[RAG Query] Property Extraction - Property: ${prop}, Object:`, obj);
                if (!prop) {
                    console.error(`[RAG Query] WARNING: Property query detected but no property extracted from: "${query}"`);
                }
                if (!obj) {
                    console.error(`[RAG Query] WARNING: Property query detected but no object type extracted from: "${query}"`);
                }
            }
            
            // Step 2: Embed the query
            console.error(`[RAG Query] Generating embedding for query...`);
            let queryEmbedding;
            try {
                queryEmbedding = await embedText(query);
                console.error(`[RAG Query] Embedding generated successfully (dimension: ${queryEmbedding.length})`);
            } catch (embedError) {
                console.error(`[RAG Query] FAILED: Embedding generation failed`);
                console.error(`[RAG Query] Embedding Error: ${embedError.message}`);
                console.error(`[RAG Query] Embedding Error Stack: ${embedError.stack}`);
                throw new Error(`Failed to generate embedding: ${embedError.message}`);
            }
            
            // Step 3: Search Qdrant - use higher limit to get all matches
            const searchLimit = Math.max(limit, 100);
            console.error(`[RAG Query] Searching Qdrant collection "${collection}" with limit ${searchLimit}...`);
            
            let searchResults;
            try {
                searchResults = await qdrantClient.search(collection, {
                    vector: queryEmbedding,
                    limit: searchLimit,
                    with_payload: true,
                    with_vector: false,
                });
                console.error(`[RAG Query] Qdrant search completed - Found ${searchResults?.length || 0} results`);
                
                // Log similarity scores for top results
                if (searchResults && searchResults.length > 0) {
                    const topScores = searchResults.slice(0, 5).map((r, idx) => ({
                        index: idx + 1,
                        score: r.score,
                        objectName: getObjectName(r.payload) || 'Unknown',
                        frameId: getFrameId(r.payload) || 'N/A'
                    }));
                    console.error(`[RAG Query] Top 5 similarity scores:`, JSON.stringify(topScores, null, 2));
                }
            } catch (searchError) {
                console.error(`[RAG Query] FAILED: Qdrant search error`);
                console.error(`[RAG Query] Search Error Type: ${searchError.constructor.name}`);
                console.error(`[RAG Query] Search Error Message: ${searchError.message}`);
                console.error(`[RAG Query] Search Error Stack: ${searchError.stack}`);
                console.error(`[RAG Query] Collection: ${collection}, QDRANT_URL: ${process.env.QDRANT_URL || 'not set'}`);
                throw new Error(`Qdrant search failed: ${searchError.message}`);
            }
            
            if (!searchResults || searchResults.length === 0) {
                // Fallback to LLM if no results
                console.error(`[RAG Query] FAILED: No search results found`);
                console.error(`[RAG Query] Reason: Qdrant returned empty results array`);
                console.error(`[RAG Query] Collection: ${collection}, Search limit: ${searchLimit}`);
                console.error(`[RAG Query] Falling back to LLM...`);
                
                const llmResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are a room-inspection assistant. Analyze rooms and objects using the vector database as your primary source. Answer from a surveyor/inspector perspective. Use only retrieved context—don't invent details. If information is missing, state it clearly. Provide brief, objective, inspection-style answers. Be concise.",
                        },
                        {
                            role: "user",
                            content: query,
                        },
                    ],
                    max_tokens: 200,
                });
                
                console.error(`[RAG Query] LLM fallback completed successfully`);
                
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
            
            // Detect if query is about spatial measurements/floor area
            const lowerQuery = query.toLowerCase();
            const isSpatialQuery = (
                lowerQuery.includes('floor area') ||
                lowerQuery.includes('livable floor') ||
                lowerQuery.includes('total floor') ||
                lowerQuery.includes('square footage') ||
                lowerQuery.includes('square meters') ||
                lowerQuery.includes('m²') ||
                lowerQuery.includes('dimensions') ||
                lowerQuery.includes('volume') ||
                lowerQuery.includes('wall area') ||
                lowerQuery.includes('perimeter') ||
                lowerQuery.includes('ceiling height') ||
                lowerQuery.includes('bounding box') ||
                lowerQuery.includes('inscribed')
            );
            
            // Check for spatial report narratives in search results (with scores)
            // Prioritize spatial reports for spatial queries
            if (isSpatialQuery) {
                const spatialReportResults = searchResults.filter(r => 
                    r.payload.document_type === 'spatial_report_narrative' || 
                    r.payload.document_type === 'spatial_report'
                );
                
                if (spatialReportResults.length > 0) {
                    // Use the highest scoring spatial report
                    const topSpatialReport = spatialReportResults[0];
                    const spatialReport = topSpatialReport.payload;
                    console.error(`[RAG Query] Spatial query detected - using spatial report narrative (score: ${topSpatialReport.score})`);
                    
                    // Extract information from narrative or payload
                    let answer = '';
                    
                    // Try to extract from narrative text
                    if (spatialReport.narrative_text || spatialReport.description) {
                        const narrative = spatialReport.narrative_text || spatialReport.description;
                        
                        // Use LLM to extract specific answer from narrative
                        try {
                            const llmResponse = await openai.chat.completions.create({
                                model: "gpt-4o-mini",
                                messages: [
                                    {
                                        role: "system",
                                        content: "You are a spatial data assistant. Extract specific numerical information from spatial reports to answer user questions. Be precise and only use information from the provided text.",
                                    },
                                    {
                                        role: "user",
                                        content: `Based on this spatial report, answer the question: "${query}"\n\nSpatial Report:\n${narrative}`,
                                    },
                                ],
                                max_tokens: 150,
                                temperature: 0.3,
                            });
                            
                            answer = llmResponse.choices[0].message.content;
                            console.error(`[RAG Query] SUCCESS: Spatial query answered using narrative`);
                            
                            return {
                                content: [{ type: "text", text: answer }],
                                isError: false,
                            };
                        } catch (llmError) {
                            console.error(`[RAG Query] Error extracting from narrative, falling through to default processing`);
                        }
                    }
                    
                    // Fallback: extract from structured payload if available
                    if (spatialReport.global_overview) {
                        const global = spatialReport.global_overview;
                        if (lowerQuery.includes('livable floor')) {
                            answer = `The total livable floor area is ${global.total_livable_floor_area_m2} m².`;
                        } else if (lowerQuery.includes('exterior floor')) {
                            answer = `The total exterior floor area is ${global.total_exterior_floor_area_m2} m².`;
                        } else if (lowerQuery.includes('wall area')) {
                            answer = `The total wall area is ${global.total_wall_area_m2} m².`;
                        } else if (lowerQuery.includes('volume')) {
                            answer = `The total volume is ${global.total_volume_m3} m³.`;
                        }
                        
                        if (answer) {
                            console.error(`[RAG Query] SUCCESS: Spatial query answered using structured data`);
                            return {
                                content: [{ type: "text", text: answer }],
                                isError: false,
                            };
                        }
                    }
                }
            }
            
            if (intent.type === 'count') {
                console.error(`[RAG Query] Processing count query...`);
                const objectTypeInfo = extractObjectType(query);
                if (objectTypeInfo) {
                    const { type, isPlural } = objectTypeInfo;
                    console.error(`[RAG Query] Count query - Looking for object type: "${type}" (plural: ${isPlural})`);
                    const matching = results.filter(r => {
                        const name = getObjectName(r);
                        if (!name) return false;
                        const nameLower = name.toLowerCase();
                        // Match exact, plural, or if the type appears in the name (for specific_type like "ergonomic office chair")
                        return nameLower === type || 
                               nameLower === type + 's' || 
                               nameLower.includes(type) ||
                               nameLower.includes(type + 's');
                    });
                    const count = matching.length;
                    console.error(`[RAG Query] Count query - Found ${count} matching objects out of ${results.length} total results`);
                    console.error(`[RAG Query] SUCCESS: Count query completed successfully`);
                    const pluralForm = isPlural ? type + 's' : type;
                    return {
                        content: [{ type: "text", text: `Found ${count} ${pluralForm} in the database.` }],
                        isError: false,
                    };
                } else {
                    console.error(`[RAG Query] Count query - No object type extracted, using total results count: ${results.length}`);
                    console.error(`[RAG Query] SUCCESS: Count query completed successfully`);
                    return {
                        content: [{ type: "text", text: `Found ${results.length} matching object(s) in the database.` }],
                        isError: false,
                    };
                }
            }
            
            if (intent.type === 'list') {
                console.error(`[RAG Query] Processing list query...`);
                const lowerQuery = query.toLowerCase();
                // Determine what to list
                if (lowerQuery.includes('material')) {
                    const materials = [...new Set(results.map(r => getMaterial(r)).filter(Boolean))];
                    console.error(`[RAG Query] SUCCESS: List query completed successfully - Found ${materials.length} materials`);
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
                if (lowerQuery.includes('color') || lowerQuery.includes('colour')) {
                    const colors = [...new Set(results.map(r => getColor(r)).filter(Boolean))];
                    console.error(`[RAG Query] SUCCESS: List query completed successfully - Found ${colors.length} colors`);
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
                if (lowerQuery.includes('room') || lowerQuery.includes('location')) {
                    const rooms = [...new Set(results.map(r => getRoom(r)).filter(Boolean))];
                    console.error(`[RAG Query] SUCCESS: List query completed successfully - Found ${rooms.length} rooms/locations`);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Rooms/Locations found: ${rooms.join(', ')}`,
                            },
                        ],
                        isError: false,
                    };
                }
                if (lowerQuery.includes('dimension') || lowerQuery.includes('size')) {
                    const dimensionsList = results
                        .map(r => {
                            const name = getObjectName(r) || 'Unknown';
                            const dims = getDimensions(r);
                            if (dims) {
                                return `${name}: ${dims}`;
                            }
                            return null;
                        })
                        .filter(Boolean);
                    if (dimensionsList.length > 0) {
                        console.error(`[RAG Query] SUCCESS: List query completed successfully - Found ${dimensionsList.length} dimensions`);
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
                if (lowerQuery.includes('architectural style') || (lowerQuery.includes('style') && lowerQuery.includes('architectural'))) {
                    const styles = [...new Set(results.map(r => getArchitecturalStyle(r)).filter(Boolean))];
                    console.error(`[RAG Query] SUCCESS: List query completed successfully - Found ${styles.length} architectural styles`);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Architectural styles found: ${styles.join(', ')}`,
                            },
                        ],
                        isError: false,
                    };
                }
                if (lowerQuery.includes('placement') || (lowerQuery.includes('where') && lowerQuery.includes('placed'))) {
                    const placements = [...new Set(results.map(r => getPlacement(r)).filter(Boolean))];
                    console.error(`[RAG Query] SUCCESS: List query completed successfully - Found ${placements.length} placements`);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Placements found: ${placements.join('; ')}`,
                            },
                        ],
                        isError: false,
                    };
                }
                if (lowerQuery.includes('design style')) {
                    const styles = [...new Set(results.map(r => getDesignStyle(r)).filter(Boolean))];
                    console.error(`[RAG Query] SUCCESS: List query completed successfully - Found ${styles.length} design styles`);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Design styles found: ${styles.join(', ')}`,
                            },
                        ],
                        isError: false,
                    };
                }
                // List all objects
                const objects = results.map(r => getObjectName(r) || 'Unknown').filter(Boolean);
                console.error(`[RAG Query] SUCCESS: List query completed successfully - Found ${objects.length} objects`);
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
            
            // Property queries now use vector search instead of scrolling/string matching
            // This ensures all queries use semantic search
            if (intent.type === 'property') {
                console.error(`[RAG Query] Processing property query using vector search...`);
                const property = extractProperty(query);
                const objectTypeInfo = extractObjectType(query);
                
                console.error(`[RAG Query] Property Query - Property: ${property}, ObjectTypeInfo:`, objectTypeInfo);
                
                // Use vector search results - they are already ranked by semantic similarity
                // Trust the vector search to find the most relevant objects
                const topResults = results.slice(0, 50); // Use top 50 most similar results from vector search
                console.error(`[RAG Query] Property Query - Using top ${topResults.length} vector search results (ranked by similarity)`);
                
                if (topResults.length === 0) {
                    console.error(`[RAG Query] Property Query - No results from vector search`);
                    return {
                        content: [{ 
                            type: "text", 
                            text: `No information found in the database for this query.` 
                        }],
                        isError: false,
                    };
                }
                
                // Log similarity scores for debugging
                const topScores = searchResults.slice(0, Math.min(10, topResults.length)).map((r, idx) => ({
                    index: idx + 1,
                    score: r.score,
                    objectName: getObjectName(r.payload) || 'Unknown'
                }));
                console.error(`[RAG Query] Property Query - Top results with similarity scores:`, JSON.stringify(topScores, null, 2));
                
                // Build structured data and convert to natural language (same as info queries)
                const structuredData = topResults.map((r, idx) => {
                    const data = {};
                    const name = getObjectName(r);
                    if (name) data.name = name;
                    
                    const color = getColor(r);
                    if (color) data.color = color;
                    
                    const material = getMaterial(r);
                    if (material) data.material = material;
                    
                    const room = getRoom(r);
                    if (room) data.location = room;
                    
                    const dims = getDimensions(r);
                    if (dims) data.size = dims;
                    
                    const style = getArchitecturalStyle(r);
                    if (style) data.architecturalStyle = style;
                    
                    const designStyle = getDesignStyle(r);
                    if (designStyle) data.designStyle = designStyle;
                    
                    const placement = getPlacement(r);
                    if (placement) data.placement = placement;
                    
                    const orientation = getOrientation(r);
                    if (orientation) data.orientation = orientation;
                    
                    const functionalRole = getFunctionalRole(r);
                    if (functionalRole) data.functionalRole = functionalRole;
                    
                    const quality = getQualityLevel(r);
                    if (quality) data.quality = quality;
                    
                    const condition = getCondition(r);
                    if (condition) data.condition = condition;
                    
                    const primaryFunction = getPrimaryFunction(r);
                    if (primaryFunction) data.primaryFunction = primaryFunction;
                    
                    const relationshipToSpace = getRelationshipToSpace(r);
                    if (relationshipToSpace) data.relationshipToSpace = relationshipToSpace;
                    
                    const frameId = getFrameId(r);
                    if (frameId) data.frameId = frameId;
                    
                    const similarity = searchResults[idx]?.score;
                    if (similarity !== undefined) {
                        data.similarity = (similarity * 100).toFixed(1);
                    }
                    
                    return data;
                });
                
                // Convert structured data to natural language using LLM
                console.error(`[RAG Query] Property Query - Converting ${topResults.length} result(s) to natural language...`);
                try {
                    const dataSummary = structuredData.map((data, idx) => {
                        const parts = [];
                        if (data.name) parts.push(`Object: ${data.name}`);
                        if (data.color) parts.push(`Color: ${data.color}`);
                        if (data.material) parts.push(`Material: ${data.material}`);
                        if (data.location) parts.push(`Location: ${data.location}`);
                        if (data.size) parts.push(`Size: ${data.size}`);
                        if (data.architecturalStyle) parts.push(`Architectural Style: ${data.architecturalStyle}`);
                        if (data.designStyle) parts.push(`Design Style: ${data.designStyle}`);
                        if (data.placement) parts.push(`Placement: ${data.placement}`);
                        if (data.orientation) parts.push(`Orientation: ${data.orientation}`);
                        if (data.functionalRole) parts.push(`Functional Role: ${data.functionalRole}`);
                        if (data.quality) parts.push(`Quality: ${data.quality}`);
                        if (data.condition) parts.push(`Condition: ${data.condition}`);
                        if (data.primaryFunction) parts.push(`Primary Function: ${data.primaryFunction}`);
                        if (data.relationshipToSpace) parts.push(`Relationship to Space: ${data.relationshipToSpace}`);
                        return parts.join(', ');
                    }).join('\n\n');
                    
                    const llmPrompt = `Convert the following structured data about objects into natural, flowing language. Write as if you're describing what you know about these objects. Be conversational and informative. Focus on answering the user's specific question about ${property ? `the ${property.replace(/_/g, ' ')} property` : 'these objects'}.

Structured data:
${dataSummary}

User's query: "${query}"

Provide a natural language description that answers the user's query about these objects.`;
                    
                    const llmResponse = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: "You are a room-inspection assistant. Analyze rooms and objects using the vector database as your primary source. Answer from a surveyor/inspector perspective. Use only retrieved context—don't invent details. If information is missing, state it clearly. Provide brief, objective, inspection-style answers. Be concise.",
                            },
                            {
                                role: "user",
                                content: llmPrompt,
                            },
                        ],
                        max_tokens: 200,
                        temperature: 0.7,
                    });
                    
                    const naturalLanguageText = llmResponse.choices[0].message.content;
                    console.error(`[RAG Query] Property Query - Natural language conversion completed`);
                    
                    return {
                        content: [{ type: "text", text: naturalLanguageText }],
                        isError: false,
                    };
                } catch (llmError) {
                    console.error(`[RAG Query] Property Query - LLM conversion failed, falling back to structured format`);
                    console.error(`[RAG Query] LLM Error: ${llmError.message}`);
                    
                    // Fallback: extract property from top results
                    if (property) {
                        const getValue = (r) => {
                            if (property === 'dimensions' || property === 'area') {
                                return getDimensions(r);
                            } else if (property === 'color') {
                                return getColor(r);
                            } else if (property === 'material') {
                                return getMaterial(r);
                            } else if (property === 'room') {
                                return getRoom(r);
                            } else if (property === 'architectural_style') {
                                return getArchitecturalStyle(r);
                            } else if (property === 'placement') {
                                return getPlacement(r);
                            } else if (property === 'orientation') {
                                return getOrientation(r);
                            } else if (property === 'design_style') {
                                return getDesignStyle(r);
                            } else if (property === 'functional_role') {
                                return getFunctionalRole(r);
                            } else if (property === 'quality') {
                                return getQualityLevel(r);
                            } else if (property === 'condition') {
                                return getCondition(r);
                            } else if (property === 'primary_function') {
                                return getPrimaryFunction(r);
                            } else if (property === 'relationship_to_space') {
                                return getRelationshipToSpace(r);
                            }
                            return null;
                        };
                        
                        const values = topResults.map(getValue).filter(v => v !== null && v !== undefined && v !== '');
                        if (values.length > 0) {
                            const unique = [...new Set(values)];
                            const propertyName = property.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            return {
                                content: [{ type: "text", text: `${propertyName}: ${unique.join(', ')}` }],
                                isError: false,
                            };
                        }
                    }
                    
                    // Final fallback to structured format
                    const infoList = structuredData.map((data, idx) => {
                        const parts = [];
                        if (data.name) parts.push(`**${data.name}**`);
                        if (data.color) parts.push(`Color: ${data.color}`);
                        if (data.material) parts.push(`Material: ${data.material}`);
                        if (data.location) parts.push(`Location: ${data.location}`);
                        if (data.size) parts.push(`Size: ${data.size}`);
                        return parts.join('\n');
                    });
                    
                    return {
                        content: [{ type: "text", text: infoList.join('\n\n') }],
                        isError: false,
                    };
                }
            }
            
            if (intent.type === 'info') {
                console.error(`[RAG Query] Processing general information query...`);
                
                // Use top results from vector search - they are already ranked by semantic similarity
                const topResults = results.slice(0, 10); // Use top 10 most similar results
                console.error(`[RAG Query] Info Query - Using top ${topResults.length} vector search results (ranked by similarity)`);
                
                if (topResults.length === 0) {
                    console.error(`[RAG Query] Info Query - No results from vector search`);
                    return {
                        content: [{ 
                            type: "text", 
                            text: `No information found in the database for this query.` 
                        }],
                        isError: false,
                    };
                }
                
                // Log similarity scores for debugging
                const topScores = searchResults.slice(0, topResults.length).map((r, idx) => ({
                    index: idx + 1,
                    score: r.score,
                    objectName: getObjectName(r.payload) || 'Unknown'
                }));
                console.error(`[RAG Query] Info Query - Top results with similarity scores:`, JSON.stringify(topScores, null, 2));
                
                // Build structured data for each result
                const structuredData = topResults.map((r, idx) => {
                    const data = {};
                    const name = getObjectName(r);
                    if (name) data.name = name;
                    
                    const color = getColor(r);
                    if (color) data.color = color;
                    
                    const material = getMaterial(r);
                    if (material) data.material = material;
                    
                    const room = getRoom(r);
                    if (room) data.location = room;
                    
                    const dims = getDimensions(r);
                    if (dims) data.size = dims;
                    
                    const style = getArchitecturalStyle(r);
                    if (style) data.architecturalStyle = style;
                    
                    const designStyle = getDesignStyle(r);
                    if (designStyle) data.designStyle = designStyle;
                    
                    const placement = getPlacement(r);
                    if (placement) data.placement = placement;
                    
                    const orientation = getOrientation(r);
                    if (orientation) data.orientation = orientation;
                    
                    const functionalRole = getFunctionalRole(r);
                    if (functionalRole) data.functionalRole = functionalRole;
                    
                    const quality = getQualityLevel(r);
                    if (quality) data.quality = quality;
                    
                    const condition = getCondition(r);
                    if (condition) data.condition = condition;
                    
                    const primaryFunction = getPrimaryFunction(r);
                    if (primaryFunction) data.primaryFunction = primaryFunction;
                    
                    const relationshipToSpace = getRelationshipToSpace(r);
                    if (relationshipToSpace) data.relationshipToSpace = relationshipToSpace;
                    
                    const frameId = getFrameId(r);
                    if (frameId) data.frameId = frameId;
                    
                    const similarity = searchResults[idx]?.score;
                    if (similarity !== undefined) {
                        data.similarity = (similarity * 100).toFixed(1);
                    }
                    
                    return data;
                });
                
                // Convert structured data to natural language using LLM
                console.error(`[RAG Query] Info Query - Converting ${topResults.length} result(s) to natural language...`);
                try {
                    const dataSummary = structuredData.map((data, idx) => {
                        const parts = [];
                        if (data.name) parts.push(`Object: ${data.name}`);
                        if (data.color) parts.push(`Color: ${data.color}`);
                        if (data.material) parts.push(`Material: ${data.material}`);
                        if (data.location) parts.push(`Location: ${data.location}`);
                        if (data.size) parts.push(`Size: ${data.size}`);
                        if (data.architecturalStyle) parts.push(`Architectural Style: ${data.architecturalStyle}`);
                        if (data.designStyle) parts.push(`Design Style: ${data.designStyle}`);
                        if (data.placement) parts.push(`Placement: ${data.placement}`);
                        if (data.orientation) parts.push(`Orientation: ${data.orientation}`);
                        if (data.functionalRole) parts.push(`Functional Role: ${data.functionalRole}`);
                        if (data.quality) parts.push(`Quality: ${data.quality}`);
                        if (data.condition) parts.push(`Condition: ${data.condition}`);
                        if (data.primaryFunction) parts.push(`Primary Function: ${data.primaryFunction}`);
                        if (data.relationshipToSpace) parts.push(`Relationship to Space: ${data.relationshipToSpace}`);
                        return parts.join(', ');
                    }).join('\n\n');
                    
                    const llmPrompt = `Convert the following structured data about objects into natural, flowing language. Write as if you're describing what you know about these objects. Be conversational and informative. If there are multiple objects, describe each one naturally.

Structured data:
${dataSummary}

User's query: "${query}"

Provide a natural language description that answers the user's query about these objects.`;
                    
                    const llmResponse = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: "You are a room-inspection assistant. Analyze rooms and objects using the vector database as your primary source. Answer from a surveyor/inspector perspective. Use only retrieved context—don't invent details. If information is missing, state it clearly. Provide brief, objective, inspection-style answers. Be concise.",
                            },
                            {
                                role: "user",
                                content: llmPrompt,
                            },
                        ],
                        max_tokens: 200,
                        temperature: 0.7,
                    });
                    
                    const naturalLanguageText = llmResponse.choices[0].message.content;
                    console.error(`[RAG Query] Info Query - Natural language conversion completed`);
                    
                    return {
                        content: [{ type: "text", text: naturalLanguageText }],
                        isError: false,
                    };
                } catch (llmError) {
                    console.error(`[RAG Query] Info Query - LLM conversion failed, falling back to structured format`);
                    console.error(`[RAG Query] LLM Error: ${llmError.message}`);
                    
                    // Fallback to structured format if LLM fails
                    const infoList = structuredData.map((data, idx) => {
                        const parts = [];
                        if (data.name) parts.push(`**${data.name}**`);
                        if (data.color) parts.push(`Color: ${data.color}`);
                        if (data.material) parts.push(`Material: ${data.material}`);
                        if (data.location) parts.push(`Location: ${data.location}`);
                        if (data.size) parts.push(`Size: ${data.size}`);
                        if (data.architecturalStyle) parts.push(`Architectural Style: ${data.architecturalStyle}`);
                        if (data.designStyle) parts.push(`Design Style: ${data.designStyle}`);
                        if (data.placement) parts.push(`Placement: ${data.placement}`);
                        if (data.orientation) parts.push(`Orientation: ${data.orientation}`);
                        if (data.functionalRole) parts.push(`Functional Role: ${data.functionalRole}`);
                        if (data.quality) parts.push(`Quality: ${data.quality}`);
                        if (data.condition) parts.push(`Condition: ${data.condition}`);
                        if (data.primaryFunction) parts.push(`Primary Function: ${data.primaryFunction}`);
                        if (data.relationshipToSpace) parts.push(`Relationship to Space: ${data.relationshipToSpace}`);
                        return parts.join('\n');
                    });
                    
                    const infoText = topResults.length === 1 
                        ? `Information:\n\n${infoList[0]}`
                        : `Information about ${topResults.length} objects:\n\n${infoList.map((info, idx) => `${idx + 1}. ${info}`).join('\n\n')}`;
                    
                    return {
                        content: [{ type: "text", text: infoText }],
                        isError: false,
                    };
                }
            }
            
            // Default: Return search results summary
            console.error(`[RAG Query] Processing default search query...`);
            const summary = results.slice(0, 5).map(r => {
                const parts = [];
                const name = getObjectName(r);
                if (name) parts.push(name);
                const color = getColor(r);
                if (color) parts.push(`color: ${color}`);
                const material = getMaterial(r);
                if (material) parts.push(`material: ${material}`);
                const room = getRoom(r);
                if (room) parts.push(`location: ${room}`);
                // Add dimensions if available
                const dims = getDimensions(r);
                if (dims) parts.push(`size: ${dims}`);
                // Add architectural style if available
                const style = getArchitecturalStyle(r);
                if (style) parts.push(`style: ${style}`);
                // Add placement if available
                const placement = getPlacement(r);
                if (placement) parts.push(`placement: ${placement}`);
                // Add frame_id if available
                const frameId = getFrameId(r);
                if (frameId) parts.push(`frame: ${frameId}`);
                return parts.join(', ');
            }).join('\n');
            
            console.error(`[RAG Query] SUCCESS: Query completed successfully with ${results.length} results`);
            
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
            console.error(`[RAG Query] FAILED: Exception caught during query processing`);
            console.error(`[RAG Query] Error Type: ${error.constructor.name}`);
            console.error(`[RAG Query] Error Message: ${error.message}`);
            console.error(`[RAG Query] Error Stack: ${error.stack}`);
            console.error(`[RAG Query] Query: "${query}"`);
            console.error(`[RAG Query] Collection: ${collection}`);
            console.error(`[RAG Query] QDRANT_URL: ${process.env.QDRANT_URL || 'not set'}`);
            console.error(`[RAG Query] QDRANT_API_KEY: ${process.env.QDRANT_API_KEY ? 'set' : 'not set'}`);
            console.error(`[RAG Query] VITE_OPENAI_API_KEY: ${process.env.VITE_OPENAI_API_KEY ? 'set' : 'not set'}`);
            
            // Fallback to LLM on error
            console.error(`[RAG Query] Attempting LLM fallback...`);
            try {
                const llmResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are a room-inspection assistant. Analyze rooms and objects using the vector database as your primary source. Answer from a surveyor/inspector perspective. Use only retrieved context—don't invent details. If information is missing, state it clearly. Provide brief, objective, inspection-style answers. Be concise.",
                        },
                        {
                            role: "user",
                            content: query,
                        },
                    ],
                    max_tokens: 200,
                });
                
                console.error(`[RAG Query] LLM fallback completed successfully`);
                
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
                console.error(`[RAG Query] FAILED: LLM fallback also failed`);
                console.error(`[RAG Query] LLM Error Type: ${llmError.constructor.name}`);
                console.error(`[RAG Query] LLM Error Message: ${llmError.message}`);
                console.error(`[RAG Query] LLM Error Stack: ${llmError.stack}`);
                
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
                        content: "You are an intelligent room-inspection assistant. Your purpose is to analyze and answer questions about the room and the objects inside it.\n\nYou have access to a vector database containing detailed information about each object in the room, including names, descriptions, attributes, materials, dimensions, placement, and relationships to other objects.\n\nWhen the user asks a question, interpret it from the point of view of a surveyor, inspector, or someone making a general inquiry about the room. Always use the retrieved context from the vector database as your primary source of truth.\n\nYour responsibilities:\n\nIdentify relevant objects based on the user's query.\n\nUse the retrieved context accurately — don't invent details if they don't exist in the database.\n\nProvide clear, objective, inspection-style explanations that help the user understand the room, layout, and objects.\n\nIf a detail is missing from the database, say so clearly rather than guessing.\n\nMaintain a professional, observational tone — like a room survey, inventory report, or property inspection.\n\nIf the user asks for interpretations, comparisons, or suggestions, base them strictly on retrieved context and reasonable general knowledge (without hallucinating specific facts).\n\nYour goal is to reliably help users understand the environment by referencing accurate stored information and giving structured, concise explanations.",
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
                max_tokens: 200,
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

// Register image replacement tool using Replicate nano banana
// COMPLETE REWRITE - Simple, direct, bulletproof approach
mcpServer.tool(
    "replace_object_in_frame",
    "Replace objects in the first image with objects from the second image using Replicate's nano-banana model.",
    {
        frameImage: z.string().describe("Frame image (data URL or URL)"),
        furnitureImage: z.string().describe("Furniture image (data URL or URL)"),
    },
    async (args) => {
        const { frameImage, furnitureImage } = args;
        const tempFiles = [];
        
        try {
            // Validate API key
            const apiKey = process.env.VITE_REPLICATE_API_KEY;
            if (!apiKey) throw new Error("VITE_REPLICATE_API_KEY not set");
            if (!frameImage || !furnitureImage) throw new Error("Both images required");

            // SIMPLE FUNCTION: Get image as Buffer - handles ALL formats
            const getImageBuffer = async (input) => {
                // URL - fetch it
                if (input.startsWith('http://') || input.startsWith('https://')) {
                    const res = await fetch(input);
                    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
                    return Buffer.from(await res.arrayBuffer());
                }
                // Data URL - extract base64
                if (input.startsWith('data:')) {
                    const base64 = input.split(',')[1];
                    if (!base64) throw new Error('Invalid data URL');
                    return Buffer.from(base64, 'base64');
                }
                // Raw base64
                return Buffer.from(input, 'base64');
            };

            // SIMPLE FUNCTION: Upload buffer to Replicate
            const uploadToReplicate = async (buffer) => {
                if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
                    throw new Error(`Invalid buffer: ${buffer?.length || 0} bytes`);
                }
                
                // Convert to Uint8Array for reliable binary transmission
                const uint8Array = new Uint8Array(buffer);
                
                const res = await fetch('https://api.replicate.com/v1/files', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${apiKey}`,
                        'Content-Type': 'application/octet-stream',
                    },
                    body: uint8Array
                });
                
                if (!res.ok) {
                    const error = await res.text();
                    throw new Error(`Upload failed: ${res.status} ${error}`);
                }
                
                const data = await res.json();
                return data.urls.get;
            };

            // Get both images as buffers
            const frameBuffer = await getImageBuffer(frameImage);
            const furnitureBuffer = await getImageBuffer(furnitureImage);
            
            // Upload both
            const frameUrl = await uploadToReplicate(frameBuffer);
            const furnitureUrl = await uploadToReplicate(furnitureBuffer);

            // Get model version
            const modelRes = await fetch('https://api.replicate.com/v1/models/google/nano-banana', {
                headers: { 'Authorization': `Token ${apiKey}` }
            });
            if (!modelRes.ok) throw new Error(`Model fetch failed: ${modelRes.status}`);
            const modelData = await modelRes.json();
            const version = modelData.latest_version.id;

            // Create prediction
            const predRes = await fetch('https://api.replicate.com/v1/predictions', {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    version,
                    input: {
                        prompt: "Replace the furniture in the first image with the furniture from the second image",
                        images: [frameUrl, furnitureUrl]
                    }
                })
            });

            if (!predRes.ok) {
                const error = await predRes.text();
                throw new Error(`Prediction failed: ${predRes.status} ${error}`);
            }

            const pred = await predRes.json();
            const predId = pred.id;

            // Poll for result
            let output = null;
            for (let i = 0; i < 60; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
                    headers: { 'Authorization': `Token ${apiKey}` }
                });
                const status = await statusRes.json();
                
                if (status.status === 'succeeded') {
                    output = status.output;
                    break;
                }
                if (status.status === 'failed') {
                    throw new Error(`Prediction failed: ${status.error || 'Unknown'}`);
                }
            }

            if (!output) throw new Error('Timeout waiting for prediction');

            // Get result image
            const resultUrl = Array.isArray(output) ? output[0] : output;
            if (!resultUrl || typeof resultUrl !== 'string') {
                throw new Error(`Invalid result: ${JSON.stringify(output)}`);
            }

            const imgRes = await fetch(resultUrl);
            if (!imgRes.ok) throw new Error(`Failed to fetch result: ${imgRes.status}`);

            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            const base64 = `data:image/png;base64,${imgBuffer.toString('base64')}`;

            return {
                content: [
                    { type: "text", text: "Image replacement completed successfully." },
                    { type: "text", text: base64, mimeType: "text/plain" }
                ],
                isError: false,
            };
        } catch (error) {
            // Cleanup
            for (const file of tempFiles) {
                try { unlinkSync(file); } catch {}
            }
            
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }],
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
