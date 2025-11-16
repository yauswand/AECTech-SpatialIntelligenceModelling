import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
// Increase body size limit to handle large base64 images (50MB limit)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let mcpClient = null;

// Start MCP server process and connect client
async function startMCP() {
    try {
        // Create client transport - it will spawn the process
        const transport = new StdioClientTransport({
            command: "node",
            args: [resolve(__dirname, "mcpServer.js")],
            env: process.env,
        });

        // Create and connect client
        mcpClient = new Client(
            {
                name: "mcp-bridge",
                version: "1.0.0",
            },
            {
                capabilities: {},
            }
        );

        await mcpClient.connect(transport);
        console.log("MCP client connected");
    } catch (error) {
        console.error("Failed to start MCP:", error);
        throw error;
    }
}

// Query endpoint
app.post("/query", async (req, res) => {
    try {
        if (!mcpClient) {
            return res.status(503).json({ error: "MCP client not connected" });
        }

        const { query, collection, limit } = req.body;

        if (!query) {
            return res.status(400).json({ error: "Query is required" });
        }

        // Call the query_spatial_data tool
        const result = await mcpClient.callTool({
            name: "query_spatial_data",
            arguments: {
                query,
                collection: collection || "prod",
                limit: limit || 20,
            },
        });

        res.json({ result: result.content });
    } catch (error) {
        console.error("Query error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Image analysis endpoint
app.post("/analyze-image", async (req, res) => {
    console.log("[MCP Bridge] /analyze-image endpoint called");
    try {
        if (!mcpClient) {
            console.error("[MCP Bridge] ERROR: MCP client not connected");
            return res.status(503).json({ error: "MCP client not connected" });
        }

        const { image, question, model } = req.body;
        console.log(`[MCP Bridge] Received request - Question: ${question || '(none)'}, Image length: ${image ? image.length : 0}, Model: ${model || 'default'}`);

        if (!image) {
            console.error("[MCP Bridge] ERROR: Image is required");
            return res.status(400).json({ error: "Image is required" });
        }

        console.log("[MCP Bridge] Calling MCP tool 'analyze_image'...");
        // Call the analyze_image tool
        const result = await mcpClient.callTool({
            name: "analyze_image",
            arguments: {
                image,
                question: question || undefined,
                model: model || "gpt-4o",
            },
        });

        console.log(`[MCP Bridge] Tool call successful, result length: ${result.content ? result.content.length : 0}`);
        console.log(`[MCP Bridge] Result preview: ${result.content && result.content[0] ? result.content[0].text.substring(0, 100) : 'N/A'}...`);
        
        res.json({ result: result.content });
    } catch (error) {
        console.error("[MCP Bridge] Image analysis error:", error);
        console.error("[MCP Bridge] Error details:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Image proxy endpoint - fetches image from URL and converts to base64 (bypasses CORS)
app.post("/fetch-image", async (req, res) => {
    console.log("[MCP Bridge] /fetch-image endpoint called");
    try {
        const { imageUrl } = req.body;

        if (!imageUrl) {
            console.error("[MCP Bridge] ERROR: imageUrl is required");
            return res.status(400).json({ error: "imageUrl is required" });
        }

        // Validate URL format
        try {
            new URL(imageUrl);
        } catch (urlError) {
            console.error("[MCP Bridge] ERROR: Invalid URL format:", imageUrl);
            return res.status(400).json({ error: `Invalid image URL format: ${imageUrl.substring(0, 100)}` });
        }

        console.log(`[MCP Bridge] Fetching image from: ${imageUrl.substring(0, 100)}...`);
        
        // Fetch the image (server-side, no CORS restrictions)
        let response;
        try {
            response = await fetch(imageUrl, {
                headers: {
                    'User-Agent': 'MCP-Bridge/1.0'
                }
            });
        } catch (fetchError) {
            console.error("[MCP Bridge] Network error fetching image:", fetchError.message);
            return res.status(500).json({ error: `Network error: ${fetchError.message}. Check if the image URL is accessible.` });
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`[MCP Bridge] HTTP error ${response.status}: ${errorText.substring(0, 200)}`);
            return res.status(response.status).json({ 
                error: `Failed to fetch image: ${response.status} ${response.statusText}. ${errorText.substring(0, 100)}` 
            });
        }
        
        // Check if response is actually an image
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            console.error(`[MCP Bridge] WARNING: Response is not an image, content-type: ${contentType}`);
            // Still proceed, but log warning
        }
        
        // Convert to buffer then to base64
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        
        // Use detected content type or default to jpeg
        const finalContentType = contentType.startsWith('image/') ? contentType : 'image/jpeg';
        const base64DataUrl = `data:${finalContentType};base64,${base64}`;
        
        console.log(`[MCP Bridge] Image converted successfully, size: ${base64.length} chars, type: ${finalContentType}`);
        
        res.json({ base64: base64DataUrl });
    } catch (error) {
        console.error("[MCP Bridge] Image fetch error:", error);
        console.error("[MCP Bridge] Error details:", error.message);
        console.error("[MCP Bridge] Error stack:", error.stack);
        res.status(500).json({ error: `Unexpected error: ${error.message}` });
    }
});

// Image replacement endpoint
app.post("/replace-object", async (req, res) => {
    console.log("[MCP Bridge] /replace-object endpoint called");
    try {
        if (!mcpClient) {
            console.error("[MCP Bridge] ERROR: MCP client not connected");
            return res.status(503).json({ error: "MCP client not connected" });
        }

        const { frameImage, furnitureImage } = req.body;

        if (!frameImage || !furnitureImage) {
            console.error("[MCP Bridge] ERROR: Both frameImage and furnitureImage are required");
            return res.status(400).json({ error: "Both frameImage and furnitureImage are required" });
        }

        console.log(`[MCP Bridge] ========================================`);
        console.log(`[MCP Bridge] Received replacement request`);
        console.log(`[MCP Bridge] Frame image: type=${typeof frameImage}, length=${frameImage?.length || 0}`);
        console.log(`[MCP Bridge] Frame image preview: ${frameImage?.substring(0, 50) || 'null'}...`);
        console.log(`[MCP Bridge] Furniture image: type=${typeof furnitureImage}, length=${furnitureImage?.length || 0}`);
        console.log(`[MCP Bridge] Furniture image preview: ${furnitureImage?.substring(0, 50) || 'null'}...`);
        console.log("[MCP Bridge] Calling MCP tool 'replace_object_in_frame'...");
        
        // Call the replace_object_in_frame tool
        const result = await mcpClient.callTool({
            name: "replace_object_in_frame",
            arguments: {
                frameImage,
                furnitureImage,
            },
        });

        console.log(`[MCP Bridge] Tool call completed`);
        console.log(`[MCP Bridge] Result content length: ${result.content ? result.content.length : 0}`);
        if (result.content && result.content.length > 0) {
            console.log(`[MCP Bridge] First content item type: ${result.content[0].type}`);
            if (result.content[0].text) {
                const textPreview = result.content[0].text.substring(0, 200);
                console.log(`[MCP Bridge] First content text preview: ${textPreview}...`);
            }
        }
        console.log(`[MCP Bridge] ========================================`);
        
        res.json({ result: result.content });
    } catch (error) {
        console.error("[MCP Bridge] Image replacement error:", error);
        console.error("[MCP Bridge] Error details:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Furniture search endpoint
app.post("/search-furniture", async (req, res) => {
    console.log("[MCP Bridge] /search-furniture endpoint called");
    try {
        if (!mcpClient) {
            console.error("[MCP Bridge] ERROR: MCP client not connected");
            return res.status(503).json({ error: "MCP client not connected" });
        }

        const { query, num_results, min_price, max_price } = req.body;

        if (!query) {
            console.error("[MCP Bridge] ERROR: Query is required");
            return res.status(400).json({ error: "Query is required" });
        }

        console.log(`[MCP Bridge] Received furniture search request - Query: "${query}", Num results: ${num_results || 10}`);
        console.log("[MCP Bridge] Calling MCP tool 'search_furniture'...");
        
        // Call the search_furniture tool
        const result = await mcpClient.callTool({
            name: "search_furniture",
            arguments: {
                query,
                num_results: num_results || 10,
                min_price: min_price || undefined,
                max_price: max_price || undefined,
            },
        });

        console.log(`[MCP Bridge] Tool call successful, result length: ${result.content ? result.content.length : 0}`);
        
        res.json({ result: result.content });
    } catch (error) {
        console.error("[MCP Bridge] Furniture search error:", error);
        console.error("[MCP Bridge] Error details:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get("/health", (req, res) => {
    res.json({ status: mcpClient ? "connected" : "disconnected" });
});

const PORT = process.env.MCP_BRIDGE_PORT || 3001;

startMCP()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`MCP Bridge server running on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Failed to start bridge:", error);
        process.exit(1);
    });

// Cleanup on exit
process.on("SIGINT", async () => {
    if (mcpClient) {
        await mcpClient.close();
    }
    process.exit(0);
});

