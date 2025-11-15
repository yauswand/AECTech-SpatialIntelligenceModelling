// Renovation App Main - Orchestrates the renovation workflow
import { ImageViewer } from './components/ImageViewer.js';
import { Chatbot } from './components/Chatbot.js';
import { ShoppingList } from './components/ShoppingList.js';
import { ReplicateService } from './services/replicateService.js';
import { VisionService } from './services/visionService.js';
import { ShoppingService } from './services/shoppingService.js';

export class RenovationApp {
    constructor() {
        this.imageViewer = null;
        this.chatbot = null;
        this.shoppingList = null;
        this.replicateService = null;
        this.visionService = null;
        this.shoppingService = null;
        this.currentRoomImage = null;
        this.identifiedFurniture = [];
        
        // Initialize services
        this.initServices();
    }

    initServices() {
        const replicateToken = import.meta.env.VITE_REPLICATE_API_TOKEN;
        const googleApiKey = import.meta.env.VITE_GOOGLE_SEARCH_API_KEY;
        const googleEngineId = import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID;

        this.replicateService = new ReplicateService(replicateToken);
        this.visionService = new VisionService(this.replicateService);
        this.shoppingService = new ShoppingService(googleApiKey, googleEngineId);
    }

    create() {
        const app = document.createElement('div');
        app.id = 'renovation-app';
        app.className = 'renovation-app hidden';
        
        // Create components
        this.imageViewer = new ImageViewer();
        this.chatbot = new Chatbot((text, image) => this.handleUserMessage(text, image));
        this.shoppingList = new ShoppingList();
        
        app.innerHTML = `
            <div class="renovation-app-container">
                <div class="renovation-left-panel">
                    ${this.imageViewer.create().outerHTML}
                </div>
                <div class="renovation-right-panel">
                    ${this.chatbot.create().outerHTML}
                </div>
            </div>
        `;

        // Re-attach components (since we used outerHTML)
        const leftPanel = app.querySelector('.renovation-left-panel');
        const rightPanel = app.querySelector('.renovation-right-panel');
        
        leftPanel.innerHTML = '';
        const imageViewerEl = this.imageViewer.create();
        leftPanel.appendChild(imageViewerEl);
        
        // Hook up image upload handler
        const imageFileInput = imageViewerEl.querySelector('#image-file-input');
        if (imageFileInput) {
            imageFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.currentRoomImage = event.target.result;
                        this.imageViewer.displayImage(event.target.result);
                        this.chatbot.addMessage('bot', 'Room image uploaded! Describe how you want to renovate it, or upload a reference image.');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        rightPanel.innerHTML = '';
        rightPanel.appendChild(this.chatbot.create());
        
        // Add shopping list to body (will be positioned absolutely)
        document.body.appendChild(this.shoppingList.create());
        
        return app;
    }

    async handleUserMessage(text, referenceImage) {
        const loadingMsg = this.chatbot.addLoadingMessage();
        
        try {
            if (!this.currentRoomImage) {
                this.chatbot.removeLoadingMessage(loadingMsg);
                this.chatbot.addMessage('bot', 'Please upload a room image first using the "Upload Image" button.');
                return;
            }

            // Generate renovated image
            this.chatbot.addMessage('bot', 'Generating renovated room image...');
            const prompt = text || 'Renovate this room with modern furniture and a clean design.';
            
            const generatedImage = await this.replicateService.generateRoomImage(
                this.currentRoomImage,
                prompt,
                referenceImage
            );

            // Display generated image
            if (generatedImage) {
                this.imageViewer.displayImage(generatedImage);
                this.currentRoomImage = generatedImage; // Update current image
                this.chatbot.addMessage('bot', 'Room renovation generated! Identifying furniture...');
                
                // Identify furniture
                await this.identifyAndDisplayFurniture(generatedImage);
            } else {
                throw new Error('No image generated');
            }
        } catch (error) {
            console.error('Error processing renovation:', error);
            this.chatbot.removeLoadingMessage(loadingMsg);
            this.chatbot.addMessage('bot', `Error: ${error.message}. Please try again.`);
        }
    }

    async identifyAndDisplayFurniture(imageData) {
        try {
            // Identify furniture
            const furniture = await this.visionService.identifyFurniture(imageData);
            this.identifiedFurniture = furniture;
            
            // Display bounding boxes
            const boxes = furniture.map(item => ({
                x: item.bbox.x,
                y: item.bbox.y,
                width: item.bbox.width,
                height: item.bbox.height,
                label: item.name
            }));
            
            this.imageViewer.setBoundingBoxes(boxes);
            
            // Generate shopping list
            this.chatbot.addMessage('bot', `Found ${furniture.length} furniture items. Generating shopping list...`);
            await this.generateShoppingList(furniture);
            
        } catch (error) {
            console.error('Error identifying furniture:', error);
            this.chatbot.addMessage('bot', `Error identifying furniture: ${error.message}`);
        }
    }

    async generateShoppingList(furniture) {
        try {
            const shoppingItems = await this.shoppingService.generateShoppingList(furniture);
            this.shoppingList.setItems(shoppingItems);
            this.shoppingList.show();
            this.chatbot.addMessage('bot', `Shopping list generated with ${shoppingItems.length} items!`);
        } catch (error) {
            console.error('Error generating shopping list:', error);
            this.chatbot.addMessage('bot', `Error generating shopping list: ${error.message}`);
        }
    }

    show() {
        const app = document.getElementById('renovation-app');
        if (app) {
            app.classList.remove('hidden');
        }
    }

    hide() {
        const app = document.getElementById('renovation-app');
        if (app) {
            app.classList.add('hidden');
        }
    }

    // Handle image upload from image viewer
    onImageUploaded(imageSrc) {
        this.currentRoomImage = imageSrc;
        this.chatbot.addMessage('bot', 'Room image uploaded! Describe how you want to renovate it, or upload a reference image.');
    }
}

