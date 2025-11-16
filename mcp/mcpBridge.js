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
app.use(express.json());

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

