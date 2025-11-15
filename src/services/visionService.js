// Vision Service - Furniture identification using Google Vision via Replicate
import { ReplicateService } from './replicateService.js';

export class VisionService {
    constructor(replicateService) {
        this.replicateService = replicateService;
    }

    async identifyFurniture(imageData) {
        try {
            // Call Replicate with Grounding DINO model
            const result = await this.replicateService.identifyFurniture(imageData);
            
            // Grounding DINO returns: { boxes: [[x1,y1,x2,y2], ...], labels: [...], scores: [...] }
            // Convert to our expected format
            if (!result || !result.boxes || !Array.isArray(result.boxes)) {
                throw new Error('Invalid response format from object detection model');
            }

            const furnitureData = result.boxes.map((box, index) => {
                // Grounding DINO returns [x1, y1, x2, y2] format
                // Convert to [x, y, width, height] format
                const [x1, y1, x2, y2] = box;
                const x = Math.min(x1, x2);
                const y = Math.min(y1, y2);
                const width = Math.abs(x2 - x1);
                const height = Math.abs(y2 - y1);
                
                return {
                    name: result.labels?.[index] || 'Unknown Furniture',
                    description: result.labels?.[index] || '',
                    bbox: {
                        x: x,
                        y: y,
                        width: width,
                        height: height
                    },
                    confidence: result.scores?.[index] || 0.5
                };
            });

            return furnitureData;
        } catch (error) {
            console.error('Error identifying furniture:', error);
            throw error;
        }
    }

    normalizeBbox(bbox) {
        // Handle different bbox formats
        if (Array.isArray(bbox)) {
            if (bbox.length === 4) {
                // Assume [x, y, width, height]
                return {
                    x: bbox[0],
                    y: bbox[1],
                    width: bbox[2],
                    height: bbox[3]
                };
            }
        } else if (bbox && typeof bbox === 'object') {
            // Already an object
            return {
                x: bbox.x || 0,
                y: bbox.y || 0,
                width: bbox.width || 0,
                height: bbox.height || 0
            };
        }
        
        return { x: 0, y: 0, width: 0, height: 0 };
    }
}

