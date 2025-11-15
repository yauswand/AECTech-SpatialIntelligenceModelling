// Mode Toggle Component - Switch between PLY Viewer and Renovation App
export class ModeToggle {
    constructor(onModeChange) {
        this.currentMode = 'ply'; // 'ply' or 'renovation'
        this.onModeChange = onModeChange;
        this.element = null;
    }

    create() {
        const toggle = document.createElement('div');
        toggle.id = 'mode-toggle';
        toggle.className = 'mode-toggle';
        
        toggle.innerHTML = `
            <button class="mode-btn ${this.currentMode === 'ply' ? 'active' : ''}" data-mode="ply">
                <span>PLY Viewer</span>
            </button>
            <button class="mode-btn ${this.currentMode === 'renovation' ? 'active' : ''}" data-mode="renovation">
                <span>Renovation App</span>
            </button>
        `;

        // Add click handlers
        toggle.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.setMode(mode);
            });
        });

        this.element = toggle;
        return toggle;
    }

    setMode(mode) {
        if (this.currentMode === mode) return;
        
        this.currentMode = mode;
        
        // Update button states
        this.element.querySelectorAll('.mode-btn').forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Notify parent
        if (this.onModeChange) {
            this.onModeChange(mode);
        }
    }

    getMode() {
        return this.currentMode;
    }
}

