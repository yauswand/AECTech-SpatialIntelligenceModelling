// Image Viewer Component - Display uploaded and generated room images
export class ImageViewer {
    constructor() {
        this.element = null;
        this.currentImage = null;
        this.boundingBoxes = [];
    }

    create() {
        const viewer = document.createElement('div');
        viewer.id = 'image-viewer';
        viewer.className = 'image-viewer';
        
        viewer.innerHTML = `
            <div class="image-viewer-content">
                <div class="image-placeholder" id="image-placeholder">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <p>Upload or generate a room image</p>
                </div>
                <img id="displayed-image" class="displayed-image hidden" alt="Room image">
                <canvas id="bounding-box-canvas" class="bounding-box-canvas hidden"></canvas>
            </div>
            <div class="image-viewer-controls">
                <button id="upload-image-btn" class="btn-primary">Upload Image</button>
                <input type="file" id="image-file-input" accept="image/*" style="display: none;">
            </div>
        `;

        // Setup file input
        const fileInput = viewer.querySelector('#image-file-input');
        const uploadBtn = viewer.querySelector('#upload-image-btn');
        
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadImage(file);
            }
        });

        this.element = viewer;
        return viewer;
    }

    loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.displayImage(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    displayImage(imageSrc) {
        const placeholder = this.element.querySelector('#image-placeholder');
        const img = this.element.querySelector('#displayed-image');
        const canvas = this.element.querySelector('#bounding-box-canvas');
        
        img.src = imageSrc;
        img.onload = () => {
            placeholder.classList.add('hidden');
            img.classList.remove('hidden');
            canvas.classList.remove('hidden');
            
            // Resize canvas to match image
            canvas.width = img.offsetWidth;
            canvas.height = img.offsetHeight;
            
            this.currentImage = imageSrc;
            this.redrawBoundingBoxes();
        };
    }

    setBoundingBoxes(boxes) {
        this.boundingBoxes = boxes;
        this.redrawBoundingBoxes();
    }

    redrawBoundingBoxes() {
        if (this.boundingBoxes.length === 0) return;
        
        const canvas = this.element.querySelector('#bounding-box-canvas');
        const img = this.element.querySelector('#displayed-image');
        
        if (!img || img.classList.contains('hidden')) return;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Scale boxes to canvas size
        const scaleX = canvas.width / img.naturalWidth;
        const scaleY = canvas.height / img.naturalHeight;
        
        this.boundingBoxes.forEach((box, index) => {
            const x = box.x * scaleX;
            const y = box.y * scaleY;
            const w = box.width * scaleX;
            const h = box.height * scaleY;
            
            // Draw bounding box
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            
            // Draw label background
            if (box.label) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
                ctx.font = '14px sans-serif';
                const textWidth = ctx.measureText(box.label).width;
                ctx.fillRect(x, y - 20, textWidth + 8, 20);
                
                // Draw label text
                ctx.fillStyle = '#000';
                ctx.fillText(box.label, x + 4, y - 5);
            }
        });
    }

    getCurrentImage() {
        return this.currentImage;
    }
}

