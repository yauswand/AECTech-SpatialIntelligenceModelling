# Replicate Models Guide

## Recommended Models for Testing

### 1. Object Detection (Furniture Identification)
**Primary Choice: `adirik/grounding-dino`**
- **What it does**: Detects objects in images based on text prompts
- **Why it's good**: Fast (<1 second), accurate, supports custom labels
- **Input format**: Image + text prompt (e.g., "chair, table, sofa, desk")
- **Output**: Bounding boxes with labels and confidence scores
- **Documentation**: https://replicate.com/adirik/grounding-dino

**Alternative: `jigsawstack/object-detection`**
- Generic object detection without needing specific prompts
- Good fallback option
- Documentation: https://replicate.com/jigsawstack/object-detection

### 2. Image Generation (Room Renovation)
**Challenge**: Replicate doesn't have Gemini Flash 2.0 directly. Here are alternatives:

**Option A: Stable Diffusion XL (`stability-ai/sdxl`)**
- High-quality image generation
- Good for creating new room designs from text prompts
- **Limitation**: Doesn't do image-to-image transformation directly
- Documentation: https://replicate.com/stability-ai/sdxl

**Option B: Image-to-Image Models**
For transforming existing room images, consider:
- **ControlNet models** - Can modify images based on prompts
- **Inpainting models** - Can replace specific parts of images
- Search Replicate for "controlnet" or "inpainting" models

**Option C: Use Replicate's Image Hosting + API**
1. Upload your image to Replicate's hosting
2. Use the returned URL with an image-to-image model
3. This approach works better for room transformation

### 3. Recommended Workflow

#### For Furniture Detection:
```javascript
// Already implemented in visionService.js
// Uses: adirik/grounding-dino
// Prompt: "chair, table, sofa, desk, cabinet, bookshelf"
```

#### For Image Generation:
Since direct image-to-image renovation is complex, consider:
1. **Text-to-Image**: Generate a new room design from scratch
2. **Image Editing**: Use inpainting to modify specific areas
3. **Hybrid**: Generate new furniture and composite onto original image

## Model IDs Currently in Code

### Object Detection
- **Model**: `adirik/grounding-dino`
- **Location**: `src/services/replicateService.js` → `identifyFurniture()`

### Image Generation  
- **Model**: `stability-ai/sdxl` (placeholder - needs adjustment)
- **Location**: `src/services/replicateService.js` → `generateRoomImage()`
- **Note**: This model may need different input format - check Replicate docs

## Testing Steps

1. **Get Replicate API Token**:
   - Sign up at https://replicate.com
   - Go to Account → API Tokens
   - Copy your token to `.env` file

2. **Test Object Detection First**:
   - Upload a room image
   - The app will call `adirik/grounding-dino`
   - Should return bounding boxes for furniture

3. **Test Image Generation**:
   - Try the current `stability-ai/sdxl` model
   - If it doesn't work, you may need to:
     - Upload image to Replicate first (get URL)
     - Use a different model that supports image-to-image
     - Adjust input parameters

## Finding Better Models

1. **Browse Replicate Collections**:
   - https://replicate.com/collections
   - Look for "Image Generation" or "Interior Design"

2. **Search for Specific Features**:
   - "room renovation"
   - "interior design"
   - "image-to-image"
   - "controlnet"

3. **Check Model Documentation**:
   - Each model page shows input/output formats
   - Test in Replicate's web UI first
   - Copy the exact parameter names to your code

## Updating Model IDs

When you find better models, update these files:
1. `src/services/replicateService.js`
   - `generateRoomImage()` - line ~88
   - `identifyFurniture()` - line ~113
2. Adjust input/output formats as needed
3. Test with a simple image first

## Current Limitations

- **Image-to-Image**: The current setup assumes direct image transformation, but many Replicate models need images uploaded first
- **Model Compatibility**: Not all models accept base64 images directly - some need URLs
- **Output Format**: Different models return different formats - you may need to adjust parsing

## Next Steps

1. ✅ Test `adirik/grounding-dino` for object detection
2. ⚠️ Find/configure image generation model that works with your workflow
3. ⚠️ Adjust input/output handling based on chosen models
4. ⚠️ Add error handling for model-specific issues

