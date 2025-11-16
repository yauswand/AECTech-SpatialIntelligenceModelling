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
                collection: collection || "dummy",
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

