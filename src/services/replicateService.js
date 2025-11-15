// Replicate API Service - Handle Gemini Flash 2.0 and other model calls
// Using backend proxy to avoid CORS issues
const REPLICATE_API_URL = import.meta.env.DEV 
    ? 'http://localhost:3000/api/replicate'  // Development: use proxy server
    : '/api/replicate';  // Production: relative path to proxy

export class ReplicateService {
    constructor(apiToken) {
        // API token is now handled by backend proxy server
        // Keeping parameter for compatibility but not using it
        this.apiToken = apiToken;
    }

    async callModel(modelIdentifier, input) {
        // API token is handled by backend proxy - no need to check here
        try {
            // Start prediction
            // Replicate API accepts either:
            // - "version" parameter with a version hash (e.g., "abc123def456")
            // - "model" parameter with "owner/model" format (e.g., "google/gemini-flash-2.0")
            // For now, we'll use the model parameter which should work with latest version
            const requestBody = {
                input: input
            };
            
            // Check if modelIdentifier is a version hash (alphanumeric, no slashes)
            // or a model path (contains slash)
            if (modelIdentifier.includes('/')) {
                // It's a model path like "owner/model"
                requestBody.model = modelIdentifier;
            } else {
                // It's a version hash
                requestBody.version = modelIdentifier;
            }
            
            // Call backend proxy instead of Replicate directly (avoids CORS)
            const proxyResponse = await fetch(`${REPLICATE_API_URL}/predictions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!proxyResponse.ok) {
                const error = await proxyResponse.json();
                throw new Error(error.error || error.detail || 'Failed to start prediction');
            }

            const result = await proxyResponse.json();
            
            // Proxy handles polling, so we get the final result directly
            if (result.error) {
                throw new Error(result.error);
            }

            return result.output;
        } catch (error) {
            console.error('Replicate API error:', error);
            throw error;
        }
    }

    // Generate room image using image-to-image model
    // Options:
    // - "stability-ai/sdxl" - Stable Diffusion XL for high-quality generation
    // - "stability-ai/stable-diffusion" - Standard Stable Diffusion
    // - For image-to-image: Use a ControlNet model or inpainting model
    // Note: You may need to use a different approach - upload image to Replicate first, then use URL
    async generateRoomImage(originalImage, prompt, referenceImage = null) {
        // Using Stable Diffusion XL as a starter - you may need to adjust based on your needs
        // For room renovation, consider: "lucataco/sdxl-lightning" or similar
        const modelId = 'stability-ai/sdxl'; // Starter model - adjust as needed
        
        // Convert base64 data URL to format expected by Replicate
        // Replicate expects either a URL or base64 string without data URL prefix
        let imageInput = originalImage;
        if (originalImage.startsWith('data:image')) {
            // Extract base64 part
            imageInput = originalImage.split(',')[1] || originalImage;
        }
        
        // SDXL typically needs: prompt, num_outputs, guidance_scale, etc.
        // Note: SDXL may not support direct image input - you might need an image-to-image model
        // For now, we'll try with prompt only. For image-to-image, consider using:
        // - A ControlNet model
        // - Or upload image to Replicate first and use URL
        const input = {
            prompt: prompt || 'A modern, renovated office room with contemporary furniture',
            num_outputs: 1,
            guidance_scale: 7.5,
            num_inference_steps: 50
            // Note: If model supports image input, add: image: imageInput
        };

        return await this.callModel(modelId, input);
    }

    // Identify furniture using object detection model
    async identifyFurniture(image) {
        // Using Grounding DINO - excellent for text-prompted object detection
        // Alternative: "jigsawstack/object-detection" for generic detection
        const modelId = 'adirik/grounding-dino'; // Well-tested object detection model
        
        // Convert base64 data URL to format expected by Replicate
        let imageInput = image;
        if (image.startsWith('data:image')) {
            imageInput = image.split(',')[1] || image;
        }
        
        // Grounding DINO input format:
        // - image: URL or base64
        // - text_prompt: comma-separated list of objects to detect
        // - box_threshold: confidence threshold (0.0-1.0)
        // - text_threshold: text matching threshold (0.0-1.0)
        const input = {
            image: imageInput,
            text_prompt: 'chair, table, sofa, desk, cabinet, bookshelf, lamp, office chair, coffee table, bookshelf, filing cabinet',
            box_threshold: 0.3,
            text_threshold: 0.25
        };

        const result = await this.callModel(modelId, input);
        
        // Grounding DINO returns: { boxes: [[x1,y1,x2,y2], ...], labels: [...], scores: [...] }
        // We need to convert this to our expected format
        return result;
    }
}

