// Backend proxy server for Replicate API (to avoid CORS issues)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from dist directory (for production)
app.use(express.static(join(__dirname, 'dist')));

// Replicate API proxy endpoint
app.post('/api/replicate/predictions', async (req, res) => {
    const replicateToken = process.env.VITE_REPLICATE_API_TOKEN || process.env.REPLICATE_API_TOKEN;
    
    if (!replicateToken) {
        return res.status(500).json({ error: 'Replicate API token not configured' });
    }

    try {
        const { model, version, input } = req.body;

        // Validate input
        if (!model && !version) {
            return res.status(400).json({ error: 'Either model or version must be provided' });
        }

        let versionHash = version;

        // If model name provided, fetch the latest version hash
        if (model && !version) {
            try {
                // Get model info to find latest version
                const modelResponse = await fetch(`https://api.replicate.com/v1/models/${model}`, {
                    headers: {
                        'Authorization': `Token ${replicateToken}`,
                    }
                });

                if (modelResponse.ok) {
                    const modelData = await modelResponse.json();
                    // Get the latest version
                    if (modelData.latest_version && modelData.latest_version.id) {
                        versionHash = modelData.latest_version.id;
                    } else {
                        // Fallback: try to get versions list
                        const versionsResponse = await fetch(`https://api.replicate.com/v1/models/${model}/versions`, {
                            headers: {
                                'Authorization': `Token ${replicateToken}`,
                            }
                        });
                        if (versionsResponse.ok) {
                            const versionsData = await versionsResponse.json();
                            if (versionsData.results && versionsData.results.length > 0) {
                                versionHash = versionsData.results[0].id;
                            }
                        }
                    }
                }

                if (!versionHash) {
                    return res.status(400).json({ 
                        error: `Could not find version for model: ${model}. Please provide a version hash instead.` 
                    });
                }
            } catch (error) {
                console.error('Error fetching model version:', error);
                return res.status(500).json({ 
                    error: `Failed to get version for model ${model}: ${error.message}` 
                });
            }
        }

        // Prepare request body with version hash
        const requestBody = {
            version: versionHash,
            input: input
        };

        // Call Replicate API
        const response = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${replicateToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            return res.status(response.status).json({ 
                error: error.detail || 'Failed to start prediction',
                replicateError: error
            });
        }

        const prediction = await response.json();
        const predictionId = prediction.id;

        // Poll for completion
        let result = prediction;
        const maxAttempts = 300; // 5 minutes max
        let attempts = 0;

        while ((result.status === 'starting' || result.status === 'processing') && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;

            const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
                headers: {
                    'Authorization': `Token ${replicateToken}`,
                }
            });

            if (!pollResponse.ok) {
                throw new Error('Failed to poll prediction status');
            }

            result = await pollResponse.json();
        }

        if (result.status === 'failed' || result.status === 'canceled') {
            return res.status(500).json({ 
                error: result.error || 'Prediction failed',
                status: result.status
            });
        }

        if (result.status !== 'succeeded') {
            return res.status(500).json({ 
                error: `Prediction did not complete. Status: ${result.status}`,
                status: result.status
            });
        }

        res.json({
            output: result.output,
            status: result.status,
            id: result.id
        });

    } catch (error) {
        console.error('Replicate API proxy error:', error);
        res.status(500).json({ 
            error: error.message || 'Internal server error',
            details: error.toString()
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// For production: serve the frontend
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Replicate API proxy: http://localhost:${PORT}/api/replicate/predictions`);
    console.log(`💡 Make sure VITE_REPLICATE_API_TOKEN is set in your .env file`);
});

