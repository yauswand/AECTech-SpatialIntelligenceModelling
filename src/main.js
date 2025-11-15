import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ModeToggle } from './components/ModeToggle.js';
import { RenovationApp } from './renovation-app.js';

// Scene setup
let scene, camera, renderer, controls;
let currentPointCloud = null;
let currentGeometry = null;
let renderMode = 'auto'; // 'auto', 'wireframe', 'points'
let animationTime = 0;

// Animation and visual parameters (adjustable via UI)
let animationSpeed = 0.01;
let animationIntensity = 0.002;
let pointSize = 0.01;
let emissiveEnabled = true;
let pointOpacity = 0.8;

// Camera trajectory
let trajectoryVisible = false;
let trajectoryPath = null;
let trajectoryTube = null;
let cameraFrustums = null;
let trajectoryData = null;
let pointCloudTransform = null; // Store transform applied to point cloud
let scanFolderPath = null; // Store scan folder path for loading frames

// Semantic labels
let labelsVisible = false;
let labelData = null;
let labelSprites = [];
let hoveredLabel = null; // Track currently hovered label for highlighting
let bestViewFrameIds = new Set(); // Track which frames have best views
let debugLines = null; // Visual debug lines from cameras to labels
let debugLinesVisible = true; // Separate toggle for debug lines

// Camera visualization colors
const DEFAULT_CAMERA_COLOR = 0x4a64d2;     // Deep blue
const BEST_VIEW_CAMERA_COLOR = 0xffff00;   // Bright yellow
const SELECTED_CAMERA_COLOR = 0x00ffff;    // Cyan
const HOVER_CAMERA_COLOR = 0xffaa00;       // Bright orange (highly visible)

// Camera selection
let raycaster = null;
let mouse = new THREE.Vector2();
let selectedCameraIndex = -1;
let cameraBodyInstances = []; // Array of camera body meshes for raycasting & coloring
let cameraLensInstances = []; // Array of camera lens meshes for coloring
let renderPosesMapping = []; // Maps camera index → trajectoryData index
let hoverDebugCounter = 0; // Throttle hover debug logs

// Keyboard controls
const keyboard = {
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false,
    space: false
};
const moveSpeed = 0.1;

// Initialize Three.js scene
function init() {
    // Create scene with black background
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Setup camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 0, 5);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Add orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 100;

    // Add lighting with game engine aesthetic
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    // Rim light for depth - game engine style
    const rimLight = new THREE.DirectionalLight(0x4080ff, 0.5);
    rimLight.position.set(-2, 1, -2);
    scene.add(rimLight);
    
    // Fill light
    const fillLight = new THREE.DirectionalLight(0xff6040, 0.3);
    fillLight.position.set(-1, -1, 1);
    scene.add(fillLight);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Setup keyboard controls
    setupKeyboardControls();
    
    // Initialize raycaster for camera selection
    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.05; // Increase threshold for small camera instances
    raycaster.params.Line.threshold = 0.05;
    
    // Setup camera selection
    setupCameraSelection();

    // Start animation loop
    animate();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update animation time with adjustable speed
    animationTime += animationSpeed;
    
    // Animate point cloud if in points mode
    if (currentPointCloud && currentPointCloud.isPoints) {
        animatePointCloud();
    }
    
    // Handle WASD movement
    handleKeyboardMovement();
    
    controls.update();
    renderer.render(scene, camera);
}

// Window resize handler
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Setup keyboard controls
function setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'w') keyboard.w = true;
        if (key === 'a') keyboard.a = true;
        if (key === 's') keyboard.s = true;
        if (key === 'd') keyboard.d = true;
        if (key === 'shift') keyboard.shift = true;
        if (key === ' ') keyboard.space = true;
        
        // Toggle wireframe/points mode with 'M' key
        if (key === 'm' && currentGeometry) {
            toggleRenderMode();
        }
    });

    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'w') keyboard.w = false;
        if (key === 'a') keyboard.a = false;
        if (key === 's') keyboard.s = false;
        if (key === 'd') keyboard.d = false;
        if (key === 'shift') keyboard.shift = false;
        if (key === ' ') keyboard.space = false;
    });
}

// Handle keyboard movement
function handleKeyboardMovement() {
    if (!camera) return;

    const speed = keyboard.shift ? moveSpeed * 2 : moveSpeed;
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();

    // Get camera direction vectors
    camera.getWorldDirection(direction);
    right.crossVectors(camera.up, direction).normalize();

    // WASD movement relative to camera direction
    if (keyboard.w) {
        camera.position.addScaledVector(direction, speed);
        controls.target.addScaledVector(direction, speed);
    }
    if (keyboard.s) {
        camera.position.addScaledVector(direction, -speed);
        controls.target.addScaledVector(direction, -speed);
    }
    if (keyboard.a) {
        camera.position.addScaledVector(right, speed);
        controls.target.addScaledVector(right, speed);
    }
    if (keyboard.d) {
        camera.position.addScaledVector(right, -speed);
        controls.target.addScaledVector(right, -speed);
    }
    
    // Up/Down movement
    if (keyboard.space) {
        camera.position.y += speed;
        controls.target.y += speed;
    }
    if (keyboard.shift && !keyboard.w && !keyboard.s && !keyboard.a && !keyboard.d) {
        camera.position.y -= speed;
        controls.target.y -= speed;
    }
}

// Load and render PLY file
function loadPLYFile(file) {
    // Show loading indicator
    const loading = document.getElementById('loading');
    const info = document.getElementById('info');
    loading.classList.remove('hidden');
    info.classList.add('hidden');

    // Remove previous point cloud if exists
    if (currentPointCloud) {
        scene.remove(currentPointCloud);
        currentPointCloud.geometry.dispose();
        currentPointCloud.material.dispose();
        currentPointCloud = null;
    }
    
    // Clean up previous labels AND debug lines if exists
    cleanupLabels(true);
    labelData = null;

    const loader = new PLYLoader();
    const reader = new FileReader();

    reader.onload = function(event) {
        try {
            const geometry = loader.parse(event.target.result);
            currentGeometry = geometry;
            
            // Center the geometry
            geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            geometry.boundingBox.getCenter(center);
            geometry.translate(-center.x, -center.y, -center.z);

            // Calculate scale to fit in view
            const size = new THREE.Vector3();
            geometry.boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 4 / maxDim;
            geometry.scale(scale, scale, scale);
            
            // Recompute bounding box after transformation to get final bounds
            geometry.computeBoundingBox();
            const bounds = {
                min: geometry.boundingBox.min.clone(),
                max: geometry.boundingBox.max.clone()
            };
            
            // Store transformation and bounds for trajectory/label alignment
            pointCloudTransform = { center, scale, bounds };

            // Check if geometry has colors, if not add default colors with emissive look
            if (!geometry.attributes.color) {
                const colors = [];
                const positions = geometry.attributes.position;
                const color = new THREE.Color();
                
                for (let i = 0; i < positions.count; i++) {
                    // Create gradient color based on height (y position)
                    const y = positions.getY(i);
                    const normalized = (y + 2) / 4; // Normalize to 0-1 range
                    
                    // Bright emissive colors - game engine style
                    // Blue-cyan-white gradient
                    color.setHSL(0.55 + normalized * 0.1, 0.7 - normalized * 0.3, 0.6 + normalized * 0.3);
                    colors.push(color.r, color.g, color.b);
                }
                
                geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            } else {
                // Brighten existing colors for emissive look
                const colors = geometry.attributes.color.array;
                for (let i = 0; i < colors.length; i += 3) {
                    colors[i] = Math.min(colors[i] * 1.5, 1.0);
                    colors[i + 1] = Math.min(colors[i + 1] * 1.5, 1.0);
                    colors[i + 2] = Math.min(colors[i + 2] * 1.5, 1.0);
                }
                geometry.attributes.color.needsUpdate = true;
            }

            // Check if geometry has face data (indices)
            const hasFaces = geometry.index !== null && geometry.index.count > 0;
            
            // Decide render mode
            if (renderMode === 'auto') {
                if (hasFaces) {
                    createWireframeMesh(geometry);
                } else {
                    createPointCloud(geometry);
                }
            } else if (renderMode === 'wireframe' && hasFaces) {
                createWireframeMesh(geometry);
            } else {
                createPointCloud(geometry);
            }

            // Update info
            const pointCount = geometry.attributes.position.count;
            const faceCount = hasFaces ? geometry.index.count / 3 : 0;
            const modeText = hasFaces ? ' | Press M to toggle mode' : '';
            document.getElementById('point-count').textContent = 
                `${pointCount.toLocaleString()} vertices${faceCount > 0 ? ` | ${Math.floor(faceCount).toLocaleString()} faces` : ''}${modeText}`;
            
            // Hide loading, show info and controls
            loading.classList.add('hidden');
            info.classList.remove('hidden');
            
            // Show controls if in points mode
            if (!hasFaces || renderMode !== 'wireframe') {
                document.getElementById('controls').classList.remove('hidden');
            }

            // Smooth camera animation to view
            animateCameraToView();
            
            // Try to auto-load trajectory first, then labels (order matters!)
            tryAutoLoadTrajectory(file.name).then(() => {
                // After trajectory loads, try to load labels
                tryAutoLoadLabels(file.name);
            });

        } catch (error) {
            console.error('Error loading PLY file:', error);
            loading.classList.add('hidden');
            alert('Error loading PLY file. Please ensure it is a valid PLY format.');
        }
    };

    reader.readAsArrayBuffer(file);
}

// Try to automatically load trajectory file based on PLY filename
async function tryAutoLoadTrajectory(plyFileName) {
    // Check for common trajectory file patterns
    const baseName = plyFileName.replace('.ply', '');
    const possibleTrajectoryPaths = [
        `/cloud/${baseName}_trajectory.json`,
        `/cloud/yash_livingroom_trajectory.json`,  // Default fallback
        `/cloud/trajectory.json`,
        `/cloud/${baseName}.json`
    ];
    
    console.log('\n📷 AUTO-LOADING CAMERA TRAJECTORY...');
    console.log(`Searching for trajectory file for ${plyFileName}...`);
    
    // Try to fetch each possible trajectory file
    for (const trajectoryPath of possibleTrajectoryPaths) {
        try {
            console.log(`Trying: ${trajectoryPath}`);
            const response = await fetch(trajectoryPath);
            
            if (response.ok) {
                console.log(`✅ Found trajectory file: ${trajectoryPath}`);
                const trajectoryJson = await response.text();
                
                // Create a Blob and File object to reuse existing loading function
                const blob = new Blob([trajectoryJson], { type: 'application/json' });
                const file = new File([blob], trajectoryPath.split('/').pop(), { type: 'application/json' });
                
                // Load the trajectory
                const success = await loadAndProcessTrajectory(file);
                
                if (success) {
                    console.log('✨ Trajectory loaded and displayed automatically!');
                    console.log('💡 TIP: Click on any camera icon to view its captured frames!');
                    // Auto-enable trajectory visualization
                    document.getElementById('trajectory-toggle').checked = true;
                    toggleCameraTrajectory(true);
                    return true;
                }
            }
        } catch (error) {
            // File not found, continue to next option
            console.log(`  ❌ Not found: ${trajectoryPath}`);
        }
    }
    
    // If no trajectory found, show manual loading instructions
    console.log('\n⚠️ No trajectory file found automatically.');
    console.log('You can manually load it using the "Load Trajectory" button in the Controls panel.\n');
    
    // Highlight the load trajectory button for manual loading
    const loadBtn = document.getElementById('load-trajectory-btn');
    if (loadBtn && !trajectoryData) {
        loadBtn.style.animation = 'pulse 2s ease-in-out 3';
        loadBtn.style.border = '2px solid #4080ff';
        setTimeout(() => {
            loadBtn.style.animation = '';
            loadBtn.style.border = '';
        }, 6000);
    }
    
    return false;
}

// Create wireframe mesh
function createWireframeMesh(geometry) {
    const material = new THREE.MeshBasicMaterial({
        color: 0xccddff,
        wireframe: true,
        transparent: true,
        opacity: 0.85
    });

    currentPointCloud = new THREE.Mesh(geometry, material);
    scene.add(currentPointCloud);
}

// Create point cloud
function createPointCloud(geometry) {
    const material = new THREE.PointsMaterial({
        size: pointSize,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: pointOpacity,
        blending: emissiveEnabled ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false
    });

    currentPointCloud = new THREE.Points(geometry, material);
    
    // Store original positions for animation
    const positions = geometry.attributes.position.array;
    const originalPositions = new Float32Array(positions);
    geometry.userData.originalPositions = originalPositions;
    
    // Create random offsets for each point
    const randomOffsets = new Float32Array(positions.length);
    for (let i = 0; i < randomOffsets.length; i += 3) {
        randomOffsets[i] = Math.random() * Math.PI * 2; // X phase
        randomOffsets[i + 1] = Math.random() * Math.PI * 2; // Y phase
        randomOffsets[i + 2] = Math.random() * Math.PI * 2; // Z phase
    }
    geometry.userData.randomOffsets = randomOffsets;
    
    scene.add(currentPointCloud);
}

// Animate point cloud with subtle floating motion
function animatePointCloud() {
    if (!currentPointCloud || !currentPointCloud.geometry.userData.originalPositions) return;
    if (animationSpeed === 0) return; // Skip if animation is paused
    
    const positions = currentPointCloud.geometry.attributes.position.array;
    const originalPositions = currentPointCloud.geometry.userData.originalPositions;
    const offsets = currentPointCloud.geometry.userData.randomOffsets;
    
    // Floating animation with adjustable intensity
    for (let i = 0; i < positions.length; i += 3) {
        positions[i] = originalPositions[i] + Math.sin(animationTime + offsets[i]) * animationIntensity;
        positions[i + 1] = originalPositions[i + 1] + Math.sin(animationTime * 0.8 + offsets[i + 1]) * animationIntensity;
        positions[i + 2] = originalPositions[i + 2] + Math.cos(animationTime * 0.6 + offsets[i + 2]) * animationIntensity;
    }
    
    currentPointCloud.geometry.attributes.position.needsUpdate = true;
}

// Toggle between wireframe and points mode
function toggleRenderMode() {
    if (!currentGeometry) return;
    
    const hasFaces = currentGeometry.index !== null && currentGeometry.index.count > 0;
    if (!hasFaces) {
        console.log('No face data available - point cloud only');
        return;
    }

    // Remove current mesh
    if (currentPointCloud) {
        scene.remove(currentPointCloud);
        currentPointCloud.material.dispose();
        currentPointCloud = null;
    }

    // Toggle mode
    if (currentPointCloud instanceof THREE.Mesh || renderMode === 'wireframe') {
        renderMode = 'points';
        createPointCloud(currentGeometry);
        document.getElementById('controls').classList.remove('hidden');
        console.log('Switched to Points mode');
    } else {
        renderMode = 'wireframe';
        createWireframeMesh(currentGeometry);
        document.getElementById('controls').classList.add('hidden');
        console.log('Switched to Wireframe mode');
    }
}

// Animate camera to optimal view
function animateCameraToView() {
    const targetPosition = new THREE.Vector3(3, 2, 5);
    const startPosition = camera.position.clone();
    const duration = 1500;
    const startTime = Date.now();

    function animate() {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = easeInOutCubic(progress);

        camera.position.lerpVectors(startPosition, targetPosition, eased);
        camera.lookAt(0, 0, 0);

        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }

    animate();
}

// Easing function
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Drag and drop handlers
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const body = document.body;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Show drop zone when dragging files
    ['dragenter', 'dragover'].forEach(eventName => {
        body.addEventListener(eventName, () => {
            dropZone.classList.add('active');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        body.addEventListener(eventName, (e) => {
            // Only hide if we're leaving the body entirely
            if (eventName === 'dragleave' && e.target === body) {
                dropZone.classList.remove('active', 'drag-over');
            }
            if (eventName === 'drop') {
                dropZone.classList.remove('active', 'drag-over');
            }
        });
    });

    // Highlight drop zone when hovering over it
    dropZone.addEventListener('dragenter', () => {
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        if (e.target === dropZone) {
            dropZone.classList.remove('drag-over');
        }
    });

    // Handle dropped files
    body.addEventListener('drop', handleDrop);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            const file = files[0];
            
            // Validate file extension
            if (file.name.toLowerCase().endsWith('.ply')) {
                loadPLYFile(file);
            } else {
                alert('Please drop a .ply file');
            }
        }
    }
}

// UI event handlers
function setupUI() {
    const closeButton = document.getElementById('close-instructions');
    const instructions = document.getElementById('instructions');

    closeButton.addEventListener('click', () => {
        instructions.classList.add('hidden');
    });
    
    // Setup control panel
    setupControlPanel();
}

// Setup control panel handlers
function setupControlPanel() {
    const toggleBtn = document.getElementById('toggle-controls');
    const controls = document.getElementById('controls');
    
    toggleBtn.addEventListener('click', () => {
        controls.classList.toggle('collapsed');
        toggleBtn.textContent = controls.classList.contains('collapsed') ? '+' : '−';
    });
    
    // Emissive toggle
    document.getElementById('emissive-toggle').addEventListener('change', (e) => {
        emissiveEnabled = e.target.checked;
        updatePointCloudMaterial();
    });
    
    // Point size slider
    document.getElementById('point-size').addEventListener('input', (e) => {
        pointSize = parseFloat(e.target.value);
        document.getElementById('point-size-value').textContent = pointSize.toFixed(3);
        updatePointCloudMaterial();
    });
    
    // Animation speed slider
    document.getElementById('anim-speed').addEventListener('input', (e) => {
        animationSpeed = parseFloat(e.target.value);
        document.getElementById('anim-speed-value').textContent = animationSpeed.toFixed(3);
    });
    
    // Animation intensity slider
    document.getElementById('anim-intensity').addEventListener('input', (e) => {
        animationIntensity = parseFloat(e.target.value);
        document.getElementById('anim-intensity-value').textContent = animationIntensity.toFixed(4);
    });
    
    // Opacity slider
    document.getElementById('opacity').addEventListener('input', (e) => {
        pointOpacity = parseFloat(e.target.value);
        document.getElementById('opacity-value').textContent = pointOpacity.toFixed(2);
        updatePointCloudMaterial();
    });
    
    // Trajectory toggle
    document.getElementById('trajectory-toggle').addEventListener('change', (e) => {
        toggleCameraTrajectory(e.target.checked);
    });
    
    // Load trajectory button
    const trajectoryFileInput = document.getElementById('trajectory-file-input');
    document.getElementById('load-trajectory-btn').addEventListener('click', () => {
        trajectoryFileInput.click();
    });
    
    trajectoryFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const success = await loadAndProcessTrajectory(file);
            if (success) {
                // Enable the toggle if trajectory loaded successfully
                document.getElementById('trajectory-toggle').checked = true;
                toggleCameraTrajectory(true);
            } else {
                alert('Failed to load trajectory data. Please check the console for errors.');
            }
        }
    });
    
    // Semantic labels toggle
    document.getElementById('labels-toggle').addEventListener('change', (e) => {
        toggleSemanticLabels(e.target.checked);
    });
    
    // Debug lines toggle (separate from labels)
    document.getElementById('debug-lines-toggle').addEventListener('change', (e) => {
        toggleDebugLines(e.target.checked);
    });
}

// Update point cloud material properties in real-time
function updatePointCloudMaterial() {
    if (!currentPointCloud || !currentPointCloud.isPoints) return;
    
    currentPointCloud.material.size = pointSize;
    currentPointCloud.material.opacity = pointOpacity;
    currentPointCloud.material.blending = emissiveEnabled ? THREE.AdditiveBlending : THREE.NormalBlending;
    currentPointCloud.material.needsUpdate = true;
}

// Build a THREE.Matrix4 from a 16-element pose array that may be row-major or column-major.
function buildMatrixFromPoseArray(poseArray) {
    const matrix = new THREE.Matrix4();
    if (!Array.isArray(poseArray) || poseArray.length !== 16) {
        return matrix.identity();
    }

    // Heuristic: translation either at indices (3,7,11) [row-major] or (12,13,14) [column-major].
    const tRowLen = Math.hypot(poseArray[3], poseArray[7], poseArray[11]);
    const tColLen = Math.hypot(poseArray[12], poseArray[13], poseArray[14]);

    if (tRowLen >= tColLen) {
        // Row-major order
        matrix.set(
            poseArray[0], poseArray[1], poseArray[2],  poseArray[3],
            poseArray[4], poseArray[5], poseArray[6],  poseArray[7],
            poseArray[8], poseArray[9], poseArray[10], poseArray[11],
            poseArray[12], poseArray[13], poseArray[14], poseArray[15]
        );
    } else {
        // Column-major flattened
        matrix.set(
            poseArray[0], poseArray[4], poseArray[8],  poseArray[12],
            poseArray[1], poseArray[5], poseArray[9],  poseArray[13],
            poseArray[2], poseArray[6], poseArray[10], poseArray[14],
            poseArray[3], poseArray[7], poseArray[11], poseArray[15]
        );
    }

    return matrix;
}

// Load and parse camera trajectory data from a JSON file
async function loadCameraTrajectoryFromFile(trajectoryFile) {
    try {
        console.log('Loading camera trajectory...');
        
        // Read the trajectory JSON file
        const reader = new FileReader();
        
        return new Promise((resolve, reject) => {
            reader.onload = function(event) {
                try {
                    const trajectoryJson = JSON.parse(event.target.result);
                    const cameraPoses = [];
                    
                    // Store scan folder path for loading frames
                    if (trajectoryJson.scan_folder) {
                        scanFolderPath = `/cloud/Untitled_Scan_22_24_52/${trajectoryJson.scan_folder}`;
                        console.log('📁 Scan folder path set to:', scanFolderPath);
                        console.log('📷 Frame format will be: frame_00000.png or frame_00000.jpg');
                    } else {
                        console.warn('⚠️ No scan_folder found in trajectory JSON');
                        // Try default path
                        scanFolderPath = '/cloud/Untitled_Scan_22_24_52/2025_11_10_21_44_21';
                        console.log('📁 Using default scan folder path:', scanFolderPath);
                    }
                    
                    // Parse ALL camera poses for calculation accuracy
                    for (let i = 0; i < trajectoryJson.poses.length; i++) {
                        const poseData = trajectoryJson.poses[i];
                        const poseMatrix = poseData.cameraPoseARFrame;
                        if (poseMatrix && poseMatrix.length === 16) {
                            // Create THREE.js matrix from the pose data
                            const matrix = buildMatrixFromPoseArray(poseMatrix);
                            
                            // Extract position and rotation
                            const position = new THREE.Vector3();
                            const quaternion = new THREE.Quaternion();
                            const scale = new THREE.Vector3();
                            matrix.decompose(position, quaternion, scale);
                            
                            cameraPoses.push({
                                index: poseData.frame_index,
                                position: position,
                                quaternion: quaternion,
                                matrix: matrix
                            });
                        }
                    }
                    
                    console.log(`Loaded ${cameraPoses.length} camera poses`);
                    resolve(cameraPoses);
                    
                } catch (error) {
                    console.error('Error parsing trajectory data:', error);
                    reject(error);
                }
            };
            
            reader.onerror = function(error) {
                console.error('Error reading trajectory file:', error);
                reject(error);
            };
            
            reader.readAsText(trajectoryFile);
        });
        
    } catch (error) {
        console.error('Error loading camera trajectory:', error);
        return null;
    }
}

// Load trajectory data and apply transformations
async function loadAndProcessTrajectory(trajectoryFile) {
    if (!pointCloudTransform) {
        console.warn('Point cloud not loaded yet. Load a PLY file first.');
        return false;
    }
    
    // Clean up existing trajectory
    cleanupTrajectory();
    
    // Load raw camera poses
    const rawPoses = await loadCameraTrajectoryFromFile(trajectoryFile);
    if (!rawPoses || rawPoses.length === 0) {
        console.error('Failed to load trajectory data');
        return false;
    }
    
    // Apply same transformations as point cloud
    trajectoryData = transformTrajectoryData(
        rawPoses,
        pointCloudTransform.center,
        pointCloudTransform.scale
    );
    
    console.log('Trajectory loaded and transformed:', {
        poseCount: trajectoryData.length,
        firstPosition: trajectoryData[0].position,
        lastPosition: trajectoryData[trajectoryData.length - 1].position
    });
    
    // If trajectory is enabled, show it
    if (trajectoryVisible) {
        toggleCameraTrajectory(true);
    }
    
    return true;
}

// Apply same transformation to trajectory as point cloud
function transformTrajectoryData(cameraPoses, center, scale) {
    const transformedPoses = cameraPoses.map(pose => {
        const transformedPos = pose.position.clone();
        transformedPos.sub(center);
        transformedPos.multiplyScalar(scale);
        
        return {
            index: pose.index,
            position: transformedPos,
            quaternion: pose.quaternion.clone(),
            matrix: pose.matrix.clone()
        };
    });
    
    return transformedPoses;
}

// Create smooth spline trajectory tube
function createTrajectoryTube(cameraPoses) {
    if (!cameraPoses || cameraPoses.length < 2) {
        console.warn('Not enough camera poses to create trajectory:', cameraPoses?.length);
        return null;
    }
    
    console.log('Creating trajectory tube with', cameraPoses.length, 'poses');
    
    // Extract positions for the curve
    const points = cameraPoses.map(pose => pose.position);
    
    // Create smooth curve through all points
    const curve = new THREE.CatmullRomCurve3(points);
    curve.curveType = 'catmullrom';
    curve.tension = 0.5;
    
    // Create tube geometry along the curve - sleek and thin
    // Parameters: curve, tubularSegments, radius, radialSegments, closed
    const tubeGeometry = new THREE.TubeGeometry(curve, points.length * 2, 0.008, 8, false);
    
    // Create gradient colors along the tube (cyan to purple)
    const colors = [];
    const colorStart = new THREE.Color(0x4080ff); // Cyan
    const colorEnd = new THREE.Color(0x764ba2);   // Purple
    const vertexCount = tubeGeometry.attributes.position.count;
    
    for (let i = 0; i < vertexCount; i++) {
        const t = i / vertexCount;
        const color = new THREE.Color().lerpColors(colorStart, colorEnd, t);
        colors.push(color.r, color.g, color.b);
    }
    
    tubeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Create material with vertex colors and proper 3D shading - sleek and elegant
    const tubeMaterial = new THREE.MeshPhongMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        depthTest: true,
        depthWrite: false,
        shininess: 40,
        emissive: 0x221144,
        emissiveIntensity: 0.15,
        side: THREE.DoubleSide
    });
    
    const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
    return tubeMesh;
}

// Create camera frustum objects as proper 3D models
function createCameraFrustums(cameraPoses) {
    if (!cameraPoses || cameraPoses.length === 0) return null;
    
    // Filter to every 2nd camera for rendering (performance)
    // BUT always include best view cameras (for debugging)
    // ALSO store mapping from instanceId → trajectoryData index for click handling
    renderPosesMapping = []; // Clear previous mapping
    const renderPoses = [];
    
    cameraPoses.forEach((pose, trajectoryIndex) => {
        // Always include if it's a best view camera
        const isBestView = bestViewFrameIds.has(pose.index);
        const isEverySecond = trajectoryIndex % 2 === 0;
        
        if (isBestView || isEverySecond) {
            renderPoses.push(pose);
            renderPosesMapping.push(trajectoryIndex); // Store the original trajectory index
        }
    });
    
    // Count how many are best view cameras
    const bestViewCount = renderPoses.filter(pose => bestViewFrameIds.has(pose.index)).length;
    
    console.log(`\n📷 CREATING CAMERA FRUSTUMS:`);
    console.log(`   - Total in trajectory: ${cameraPoses.length}`);
    console.log(`   - Rendering: ${renderPoses.length} cameras`);
    console.log(`   - Regular cameras: ${renderPoses.length - bestViewCount} (BLUE)`);
    console.log(`   - Best view cameras: ${bestViewCount} (BRIGHT YELLOW ⚠️)`);
    console.log(`   - Mapping: instanceId → trajectoryIndex stored for ${renderPosesMapping.length} cameras`);
    
    if (bestViewCount === 0 && bestViewFrameIds.size > 0) {
        console.warn(`⚠️ WARNING: ${bestViewFrameIds.size} best view IDs exist but 0 matched in renderPoses!`);
        console.log(`   This means frame IDs don't align between labels and trajectory.`);
    }
    
    // Create a group to hold all camera components
    const cameraGroup = new THREE.Group();
    
    // Create sleek, compact 3D camera geometry with box + cone (frustum)
    // Camera body - a smaller solid box
    const bodyGeometry = new THREE.BoxGeometry(0.025, 0.018, 0.018);
    
    // Lens/direction indicator - cone pointing DOWN -Z axis (ARKit camera convention)
    const lensGeometry = new THREE.ConeGeometry(0.006, 0.02, 8);
    lensGeometry.rotateX(Math.PI / 2); // Point along Z axis
    lensGeometry.translate(0, 0, -0.019); // Position in FRONT of body (down -Z)
    
    // Frustum lines to show view direction - pointing down -Z axis (ARKit convention)
    const frustumGeometry = new THREE.BufferGeometry();
    const frustumVertices = new Float32Array([
        // Lines from camera corners to frustum far plane - NEGATIVE Z for ARKit
        -0.0125, -0.009, -0.009,  -0.035, -0.025, -0.06,  // Bottom-left
        0.0125, -0.009, -0.009,   0.035, -0.025, -0.06,   // Bottom-right
        0.0125, 0.009, -0.009,    0.035, 0.025, -0.06,    // Top-right
        -0.0125, 0.009, -0.009,   -0.035, 0.025, -0.06,   // Top-left
        // Far plane rectangle
        -0.035, -0.025, -0.06,  0.035, -0.025, -0.06,   // Bottom edge
        0.035, -0.025, -0.06,   0.035, 0.025, -0.06,    // Right edge
        0.035, 0.025, -0.06,    -0.035, 0.025, -0.06,   // Top edge
        -0.035, 0.025, -0.06,   -0.035, -0.025, -0.06   // Left edge
    ]);
    frustumGeometry.setAttribute('position', new THREE.BufferAttribute(frustumVertices, 3));
    
    // Base materials (will be cloned per camera so each has its own color)
    const bodyMaterialTemplate = new THREE.MeshBasicMaterial({
        color: DEFAULT_CAMERA_COLOR,
        toneMapped: false
    });
    
    const lensMaterialTemplate = new THREE.MeshBasicMaterial({
        color: DEFAULT_CAMERA_COLOR,
        toneMapped: false
    });
    
    const frustumMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        linewidth: 1,
        depthTest: true,
        depthWrite: false  // Don't write to depth buffer so meshes can render on top
    });
    
    // Use LineSegments for frustum lines and per-camera meshes
    const frustumLines = new THREE.Group();
    cameraBodyInstances = [];
    cameraLensInstances = [];
    
    // Set transformation matrix for each camera (using renderPoses)
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);
    
    let yellowCount = 0;
    
    renderPoses.forEach((pose, index) => {
        const isBestView = bestViewFrameIds.has(pose.index);
        const baseColor = isBestView ? BEST_VIEW_CAMERA_COLOR : DEFAULT_CAMERA_COLOR;
        
        if (isBestView) {
            yellowCount++;
        }
        
        // Compose transformation matrix from position and quaternion
        // All cameras same size (no scaling difference between best-view and regular)
        scale.set(1, 1, 1);
        matrix.compose(pose.position, pose.quaternion, scale);
        
        // Create body mesh with its own material
        const bodyMaterial = bodyMaterialTemplate.clone();
        bodyMaterial.color.setHex(baseColor);
        const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        bodyMesh.applyMatrix4(matrix);
        bodyMesh.userData.cameraIndex = index;
        bodyMesh.userData.trajectoryIndex = renderPosesMapping[index];
        cameraBodyInstances.push(bodyMesh);
        cameraGroup.add(bodyMesh);
        
        // Create lens mesh with its own material
        const lensMaterial = lensMaterialTemplate.clone();
        lensMaterial.color.setHex(baseColor);
        const lensMesh = new THREE.Mesh(lensGeometry, lensMaterial);
        lensMesh.applyMatrix4(matrix);
        lensMesh.userData.cameraIndex = index;
        lensMesh.userData.trajectoryIndex = renderPosesMapping[index];
        cameraLensInstances.push(lensMesh);
        cameraGroup.add(lensMesh);
        
        // Create frustum lines for each camera
        const frustumLineGeo = new THREE.BufferGeometry();
        const transformedVertices = new Float32Array(frustumVertices.length);
        
        const tempVec = new THREE.Vector3();
        for (let i = 0; i < frustumVertices.length; i += 3) {
            tempVec.set(frustumVertices[i], frustumVertices[i + 1], frustumVertices[i + 2]);
            tempVec.applyMatrix4(matrix);
            transformedVertices[i] = tempVec.x;
            transformedVertices[i + 1] = tempVec.y;
            transformedVertices[i + 2] = tempVec.z;
        }
        
        frustumLineGeo.setAttribute('position', new THREE.BufferAttribute(transformedVertices, 3));
        const frustumLinesMesh = new THREE.LineSegments(frustumLineGeo, frustumMaterial);
        frustumLines.add(frustumLinesMesh);
    });
    
    console.log(`  Total yellow cameras colored: ${yellowCount}`);
    
    // Add frustum lines group behind the camera meshes
    frustumLines.renderOrder = 0;
    cameraGroup.add(frustumLines);
    
    return cameraGroup;
}

// Recreate camera frustums (e.g., when best view data changes)
function recreateCameraFrustums() {
    if (!trajectoryData || trajectoryData.length === 0) {
        console.warn('No trajectory data to recreate frustums');
        return;
    }
    
    // Remove old frustums
    if (cameraFrustums) {
        scene.remove(cameraFrustums);
        cameraFrustums.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        cameraFrustums = null;
        cameraBodyInstances = [];
        cameraLensInstances = [];
    }
    
    // Create new frustums with updated highlighting
    cameraFrustums = createCameraFrustums(trajectoryData);
    if (cameraFrustums) {
        scene.add(cameraFrustums);
        cameraFrustums.visible = trajectoryVisible;
        console.log('✅ Camera frustums recreated with best view highlighting');
    }
}

// Toggle camera trajectory visibility
function toggleCameraTrajectory(visible) {
    trajectoryVisible = visible;
    
    if (visible) {
        if (!trajectoryData) {
            console.log('Trajectory data not loaded yet');
            return;
        }
        
        console.log('Creating trajectory visualization...');
        
        // Create trajectory if it doesn't exist
        if (!trajectoryTube) {
            trajectoryTube = createTrajectoryTube(trajectoryData);
            if (trajectoryTube) {
                scene.add(trajectoryTube);
                console.log('Trajectory tube added to scene');
            } else {
                console.error('Failed to create trajectory tube');
            }
        }
        
        if (!cameraFrustums) {
            cameraFrustums = createCameraFrustums(trajectoryData);
            if (cameraFrustums) {
                scene.add(cameraFrustums);
                console.log('Camera frustums added to scene');
            } else {
                console.error('Failed to create camera frustums');
            }
        }
        
        // Show trajectory
        if (trajectoryTube) {
            trajectoryTube.visible = true;
            console.log('Trajectory tube visible, position:', trajectoryTube.position);
        }
        if (cameraFrustums) {
            cameraFrustums.visible = true;
            console.log('Camera frustums visible');
        }
        
    } else {
        console.log('Hiding trajectory');
        // Hide trajectory
        if (trajectoryTube) trajectoryTube.visible = false;
        if (cameraFrustums) cameraFrustums.visible = false;
    }
}

// Clean up trajectory objects
function cleanupTrajectory() {
    if (trajectoryTube) {
        scene.remove(trajectoryTube);
        trajectoryTube.geometry.dispose();
        trajectoryTube.material.dispose();
        trajectoryTube = null;
    }
    
    if (cameraFrustums) {
        scene.remove(cameraFrustums);
        
        // Properly dispose of all children in the group
        cameraFrustums.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        
        cameraFrustums = null;
    }
    
    // Reset references
    trajectoryData = null;
    cameraBodyInstances = [];
    cameraLensInstances = [];
    selectedCameraIndex = -1;
    scanFolderPath = null;
}

// Try to automatically load semantic labels based on PLY filename
async function tryAutoLoadLabels(plyFileName) {
    const possibleLabelPaths = [
        `/semantic_labeling/output/unique_objects/unique_objects_final.json`,  // Load directly from final unique objects
        `/semantic_labeling/output/labels_3d/labels_3d.json`,
        `/cloud/labels_3d.json`,
        `/cloud/semantic_labels.json`
    ];
    
    console.log('\n🏷️  AUTO-LOADING SEMANTIC LABELS...');
    console.log(`Searching for labels file for ${plyFileName}...`);
    
    // Try to fetch each possible label file
    for (const labelPath of possibleLabelPaths) {
        try {
            console.log(`Trying: ${labelPath}`);
            const response = await fetch(labelPath);
            
            if (response.ok) {
                console.log(`✅ Found labels file: ${labelPath}`);
                let labelsJson = await response.json();
                
                // Normalize structure: unique_objects_final.json uses 'unique_objects' instead of 'labeled_objects'
                if (labelsJson.unique_objects && !labelsJson.labeled_objects) {
                    console.log('📦 Detected unique_objects_final.json format - normalizing structure...');
                    labelsJson.labeled_objects = labelsJson.unique_objects;
                    delete labelsJson.unique_objects;
                }
                
                // ALWAYS calculate positions in webapp (ignore any pre-calculated Python positions)
                console.log('🎯 Using WEBAPP-ONLY position calculation (ignoring Python positions)');
                
                // Load the labels with webapp-based 3D calculation
                const success = await loadLabelsDataWithWebappCalculation(labelsJson);
                
                if (success) {
                    console.log('✨ Semantic labels loaded and calculated in webapp!');
                    console.log(`📊 Loaded ${labelData.labeled_objects.length} unique objects`);
                    return true;
                }
            }
        } catch (error) {
            // File not found, continue to next option
            console.log(`  ❌ Not found: ${labelPath}`);
        }
    }
    
    console.log('\n⚠️ No semantic labels file found automatically.');
    console.log('Labels can be generated by running the semantic_labeling Python pipeline.\n');
    
    return false;
}

// Load labels data with webapp-based 3D calculation
async function loadLabelsDataWithWebappCalculation(labelsJson) {
    try {
        // Clean up old labels AND debug lines when loading new data
        cleanupLabels(true);
        
        if (!labelsJson.labeled_objects || labelsJson.labeled_objects.length === 0) {
            console.warn('No labeled objects found in JSON');
            return false;
        }
        
        if (!trajectoryData || trajectoryData.length === 0) {
            console.error('❌ TRAJECTORY NOT LOADED! Cannot calculate labels in webapp.');
            console.log('   Falling back to Python-calculated positions (no green highlighting)...\n');
            return loadLabelsData(labelsJson);
        }
        
        console.log(`✅ Trajectory loaded: ${trajectoryData.length} camera poses available\n`);
        
        console.log(`\n🎯 CALCULATING ${labelsJson.labeled_objects.length} LABELS IN WEBAPP...`);
        console.log('Using correct camera poses and depth images\n');
        
        // Collect all best view frame IDs for debugging
        bestViewFrameIds.clear();
        labelsJson.labeled_objects.forEach(obj => {
            if (obj.best_view) {
                bestViewFrameIds.add(obj.best_view.frame_id);
            }
        });
        
        console.log(`\n📷 DEBUG: Found ${bestViewFrameIds.size} unique best view cameras`);
        console.log(`Best view frame IDs:`, Array.from(bestViewFrameIds).sort((a, b) => a - b).slice(0, 10), '...');
        
        if (bestViewFrameIds.size === 0) {
            console.warn('⚠️ WARNING: No best view cameras found! Labels may not have best_view data.');
        }
        
        // Check if any best view frames match trajectory frames
        if (trajectoryData && trajectoryData.length > 0) {
            const trajectoryFrameIds = trajectoryData.map(pose => pose.index);
            const matchingFrames = Array.from(bestViewFrameIds).filter(id => trajectoryFrameIds.includes(id));
            console.log(`\n🔍 FRAME MAPPING CHECK:`);
            console.log(`   - Trajectory has ${trajectoryData.length} cameras with frame IDs: ${trajectoryFrameIds.slice(0, 10).join(', ')}...`);
            console.log(`   - Best views reference ${bestViewFrameIds.size} frames`);
            console.log(`   - Matching frames: ${matchingFrames.length} / ${bestViewFrameIds.size}`);
            
            if (matchingFrames.length === 0) {
                console.error(`❌ NO MATCHING FRAMES! Best view frame IDs don't match trajectory frame IDs!`);
                console.log(`   First 5 best view IDs: ${Array.from(bestViewFrameIds).slice(0, 5).join(', ')}`);
                console.log(`   First 5 trajectory IDs: ${trajectoryFrameIds.slice(0, 5).join(', ')}`);
            } else {
            console.log(`   ✅ ${matchingFrames.length} cameras will be highlighted in BRIGHT YELLOW`);
            console.log(`   Sample matching IDs: ${matchingFrames.slice(0, 5).join(', ')}`);
            }
        }
        
        // Store original data structure but with webapp-calculated positions
        labelData = {
            metadata: labelsJson.metadata,
            labeled_objects: []
        };
        
        let successCount = 0;
        let failCount = 0;
        
        // Process each object - ALWAYS CALCULATE FRESH POSITIONS (never use Python pre-calculated)
        for (const obj of labelsJson.labeled_objects) {
            if (!obj.best_view) {
                console.warn(`⚠️ ${obj.class_name}: No best view data`);
                failCount++;
                continue;
            }
            
            const bestView = obj.best_view;
            const frameId = bestView.frame_id;
            const bbox = bestView.bbox; // [x, y, w, h]
            
            // Find the camera pose for this frame
            const cameraPose = trajectoryData.find(pose => pose.index === frameId);
            if (!cameraPose) {
                console.warn(`⚠️ ${obj.class_name}: Frame ${frameId} not in trajectory`);
                failCount++;
                continue;
            }
            
            // ✅ ALWAYS calculate 3D position fresh from depth image + camera pose (ignoring any Python positions)
            const position3D = await calculate3DPositionFromBestView(
                frameId,
                bbox,
                cameraPose
            );
            
            if (position3D) {
                // Success! Store the object with webapp-calculated position
                // Create label_3d with all required fields (text, color, category, etc.)
                // Use class_name (formatted), NOT instance_label (which is too long)
                const labelText = obj.class_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                // Determine category from class name
                const furnitureClasses = ['chair', 'couch', 'sofa', 'table', 'bed', 'desk', 'cabinet', 'shelf', 'ottoman', 'armchair'];
                const architecturalClasses = ['wall', 'floor', 'ceiling', 'door', 'window', 'window blind'];
                
                let category = 'decor';
                const className = obj.class_name.toLowerCase();
                if (furnitureClasses.some(f => className.includes(f))) {
                    category = 'furniture';
                } else if (architecturalClasses.some(a => className.includes(a))) {
                    category = 'architectural';
                }
                
                // Color by category (matching Python colors)
                const labelColor = category === 'architectural' ? [1, 0, 0] :  // Red
                                   category === 'furniture' ? [0, 1, 0] :      // Green
                                   [0, 0, 1];                                  // Blue (decor)
                
                labelData.labeled_objects.push({
                    ...obj,
                    label_3d: {
                        text: labelText,
                        color: labelColor,
                        category: category,
                        position: [position3D.x, position3D.y, position3D.z],
                        calculated_in_webapp: true,
                        // Store camera position for debug line drawing
                        camera_position: [cameraPose.position.x, cameraPose.position.y, cameraPose.position.z],
                        frame_id: frameId
                    }
                });
                successCount++;
                console.log(`✓ ${obj.class_name}: [${position3D.x.toFixed(2)}, ${position3D.y.toFixed(2)}, ${position3D.z.toFixed(2)}]`);
            } else {
                console.warn(`✗ ${obj.class_name}: Failed to calculate 3D position`);
                failCount++;
            }
        }
        
        console.log(`\n📊 WEBAPP CALCULATION COMPLETE:`);
        console.log(`   ✓ Success: ${successCount} labels`);
        console.log(`   ✗ Failed: ${failCount} labels`);
        console.log(`\n🎨 Best view cameras: ${bestViewFrameIds.size} cameras`);
        console.log(`   Recreating trajectory to highlight best view cameras in BRIGHT YELLOW...\n`);
        
        // Always recreate camera frustums with highlighting (regardless of visibility)
        if (trajectoryData) {
            recreateCameraFrustums();
        }
        
        // Create debug lines from cameras to labels
        createDebugLines();
        
        return successCount > 0;
        
    } catch (error) {
        console.error('Error calculating labels in webapp:', error);
        return false;
    }
}

// Load labels data from JSON (DEPRECATED - DO NOT USE)
// This fallback uses Python-calculated positions which are NOT aligned with the webapp
// Labels should ONLY be calculated in the webapp using depth images and camera poses
function loadLabelsData(labelsJson) {
    console.error('⚠️ DEPRECATED: loadLabelsData() should not be called!');
    console.error('   Labels must be calculated in webapp, not from Python.');
    console.error('   Python-calculated positions are not in the correct coordinate system.');
    
    try {
        if (!labelsJson.labeled_objects || labelsJson.labeled_objects.length === 0) {
            console.warn('No labeled objects found in JSON');
            return false;
        }
        
        // Mark all labels as NOT webapp-calculated (will be skipped in renderLabels)
        labelData = {
            ...labelsJson,
            labeled_objects: labelsJson.labeled_objects.map(obj => ({
                ...obj,
                label_3d: {
                    ...obj.label_3d,
                    calculated_in_webapp: false
                }
            }))
        };
        
        console.warn(`⚠️ Loaded ${labelData.labeled_objects.length} labels with Python positions (WILL NOT RENDER)`);
        console.warn('   To fix: Ensure trajectory is loaded before labels.');
        
        return false; // Return false to indicate failure
    } catch (error) {
        console.error('Error parsing labels data:', error);
        return false;
    }
}

// Calculate 3D position from best view frame, bbox, and depth
async function calculate3DPositionFromBestView(frameId, bbox, cameraPose) {
    try {
        // Load depth image for this frame
        const depthData = await loadDepthImage(frameId);
        if (!depthData) {
            return null;
        }
        
        // Load intrinsics for this frame
        const intrinsics = await loadFrameIntrinsics(frameId);
        if (!intrinsics) {
            console.warn(`No intrinsics for frame ${frameId}`);
            return null;
        }
        
        // Calculate bbox center in RGB coordinates (1920x1440)
        const [x, y, w, h] = bbox;
        const centerX_rgb = x + w / 2;
        const centerY_rgb = y + h / 2;
        
        // Scale to depth resolution (1920x1440 → 256x192)
        const RGB_WIDTH = 1920;
        const DEPTH_WIDTH = 256;
        const SCALE_FACTOR = RGB_WIDTH / DEPTH_WIDTH;  // 7.5
        const centerX_depth = centerX_rgb / SCALE_FACTOR;
        const centerY_depth = centerY_rgb / SCALE_FACTOR;
        
        // Get depth value at scaled coordinates
        const depth = getDepthAtPixel(depthData, centerX_depth, centerY_depth);
        if (!depth || depth <= 0 || depth > 10.0) {
            console.warn(`Invalid depth ${depth?.toFixed(3)}m at RGB(${centerX_rgb.toFixed(1)}, ${centerY_rgb.toFixed(1)}) → Depth(${centerX_depth.toFixed(1)}, ${centerY_depth.toFixed(1)})`);
            return null;
        }
        
        console.log(`Frame ${frameId}: RGB center (${centerX_rgb.toFixed(1)}, ${centerY_rgb.toFixed(1)}) → Depth (${centerX_depth.toFixed(1)}, ${centerY_depth.toFixed(1)}), depth: ${depth.toFixed(3)}m`);
        
        // Unproject to 3D using ARKit convention (camera looks at -Z)
        // Use RGB coordinates for unprojection (intrinsics are for RGB resolution)
        const point3D = unprojectTo3D(
            centerX_rgb,
            centerY_rgb,
            depth,
            intrinsics,
            cameraPose.matrix
        );
        
        // Apply same transformation as point cloud (center + scale)
        if (pointCloudTransform) {
            point3D.sub(pointCloudTransform.center);
            point3D.multiplyScalar(pointCloudTransform.scale);
            
            // Check if position is within point cloud bounds
            const bounds = pointCloudTransform.bounds;
            if (bounds) {
                const margin = 0.1; // 10cm margin for tolerance
                if (point3D.x < bounds.min.x - margin || point3D.x > bounds.max.x + margin ||
                    point3D.y < bounds.min.y - margin || point3D.y > bounds.max.y + margin ||
                    point3D.z < bounds.min.z - margin || point3D.z > bounds.max.z + margin) {
                    console.warn(`✗ Position [${point3D.x.toFixed(2)}, ${point3D.y.toFixed(2)}, ${point3D.z.toFixed(2)}] outside bounds`);
                    console.warn(`  Bounds: X=[${bounds.min.x.toFixed(2)}, ${bounds.max.x.toFixed(2)}], Y=[${bounds.min.y.toFixed(2)}, ${bounds.max.y.toFixed(2)}], Z=[${bounds.min.z.toFixed(2)}, ${bounds.max.z.toFixed(2)}]`);
                    return null; // Reject labels outside point cloud
                }
            }
        }
        
        return point3D;
        
    } catch (error) {
        console.error(`Error calculating 3D position for frame ${frameId}:`, error);
        return null;
    }
}

// Unproject 2D pixel + depth to 3D world coordinates (ARKit convention: -Z forward)
function unprojectTo3D(pixelX, pixelY, depth, intrinsics, cameraToWorld) {
    // Extract intrinsic parameters
    const fx = intrinsics.fx;
    const fy = intrinsics.fy;
    const cx = intrinsics.cx;
    const cy = intrinsics.cy;
    
    // Unproject to camera space
    // ARKit convention: cameras look down -Z axis, so depth is negative Z
    const xCam = (pixelX - cx) * depth / fx;
    const yCam = (pixelY - cy) * depth / fy;
    const zCam = -depth; // CRITICAL: ARKit cameras look at -Z, not +Z
    
    // Point in camera coordinates (homogeneous)
    const pointCam = new THREE.Vector4(xCam, yCam, zCam, 1.0);
    
    // Transform to world coordinates
    const pointWorld = pointCam.applyMatrix4(cameraToWorld);
    
    return new THREE.Vector3(pointWorld.x, pointWorld.y, pointWorld.z);
}

// Load depth image for a frame (16-bit PNG)
async function loadDepthImage(frameId) {
    if (!scanFolderPath) {
        console.warn('Scan folder path not set');
        return null;
    }
    
    const frameNumberPadded = String(frameId).padStart(5, '0');
    const depthPath = `${scanFolderPath}/depth_${frameNumberPadded}.png`;
    
    try {
        // Load 16-bit depth image
        const response = await fetch(depthPath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const blob = await response.blob();
        const img = await createImageBitmap(blob);
        
        // Use canvas to read pixel data (will be downsampled to 8-bit RGBA)
        const canvas = document.createElement('canvas');
        canvas.width = img.width;   // 256
        canvas.height = img.height; // 192
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        
        console.log(`Loaded depth ${frameId}: ${img.width}x${img.height}`);
        
        return {
            data: imageData.data,
            width: img.width,
            height: img.height
        };
    } catch (error) {
        console.warn(`Failed to load depth image: ${depthPath}`, error);
        return null;
    }
}

// Load image as Promise
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// Get depth value at specific pixel from depth image (16-bit depth in millimeters)
function getDepthAtPixel(depthData, x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    
    if (ix < 0 || ix >= depthData.width || iy < 0 || iy >= depthData.height) {
        return null;
    }
    
    const idx = (iy * depthData.width + ix) * 4;
    
    // Depth is 16-bit stored in RGBA channels
    // When canvas reads 16-bit PNG, it may downsample to 8-bit
    // For ARKit depth: original values are in millimeters (uint16)
    // After canvas downsampling, we need to reconstruct the value
    
    // Try to reconstruct 16-bit value from RGBA channels
    // R and G channels may contain high and low bytes
    const r = depthData.data[idx];
    const g = depthData.data[idx + 1];
    
    // Reconstruct 16-bit value (try both byte orders)
    const depthMM_v1 = (r << 8) | g;  // Big-endian
    const depthMM_v2 = (g << 8) | r;  // Little-endian
    
    // Use the version that gives reasonable depth (0.5m - 10m)
    let depthMM = depthMM_v1;
    if (depthMM < 500 || depthMM > 10000) {
        depthMM = depthMM_v2;
    }
    
    // If still unreasonable, might be downsampled - use R channel scaled
    if (depthMM < 500 || depthMM > 10000) {
        // Assume max depth 10m = 10000mm, scaled to 0-255
        depthMM = (r / 255.0) * 10000;
    }
    
    // Convert millimeters to meters
    const depth = depthMM / 1000.0;
    
    return depth;
}

// Load camera intrinsics for a frame
async function loadFrameIntrinsics(frameId) {
    if (!scanFolderPath) {
        return null;
    }
    
    const frameNumberPadded = String(frameId).padStart(5, '0');
    const jsonPath = `${scanFolderPath}/frame_${frameNumberPadded}.json`;
    
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) return null;
        
        const data = await response.json();
        if (!data.intrinsics || data.intrinsics.length !== 9) {
            return null;
        }
        
        // Intrinsics are in flattened 3x3 format: [fx, 0, cx, 0, fy, cy, 0, 0, 1]
        return {
            fx: data.intrinsics[0],
            fy: data.intrinsics[4],
            cx: data.intrinsics[2],
            cy: data.intrinsics[5]
        };
    } catch (error) {
        console.warn(`Failed to load intrinsics for frame ${frameId}`);
        return null;
    }
}

// Create a sleek, modern label sprite (black & white design)
function createLabelSprite(text, color) {
    // Create canvas for text rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // High resolution canvas with proper aspect ratio
    canvas.width = 1024;
    canvas.height = 192;
    
    // Sleek, compact font
    context.font = '500 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const textHeight = 56;
    
    // Minimal padding for compact look
    const paddingX = 24;
    const paddingY = 16;
    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = textHeight + paddingY * 2;
    
    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Center the label box
    const x = (canvas.width - boxWidth) / 2;
    const y = (canvas.height - boxHeight) / 2;
    const radius = 8;
    
    // Sleek black background
    context.fillStyle = 'rgba(0, 0, 0, 0.9)';
    context.beginPath();
    context.roundRect(x, y, boxWidth, boxHeight, radius);
    context.fill();
    
    // Subtle white border
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, boxWidth, boxHeight, radius);
    context.stroke();
    
    // Crisp white text
    context.fillStyle = '#ffffff';
    context.font = '500 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create sprite material
    const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: true
    });
    
    // Create sprite
    const sprite = new THREE.Sprite(spriteMaterial);
    
    // Compact size with proper aspect ratio (1024:192 ≈ 5.3:1)
    sprite.scale.set(0.35, 0.065, 1);
    
    // Render labels on top
    sprite.renderOrder = 999;
    
    // Store data for hover effects
    sprite.userData.text = text;
    sprite.userData.color = color;
    sprite.userData.defaultScale = { x: 0.35, y: 0.065 };
    
    return sprite;
}

// Render all semantic labels
function renderLabels() {
    if (!labelData) {
        console.warn('Cannot render labels: missing label data');
        return;
    }
    
    console.log(`Rendering ${labelData.labeled_objects.length} semantic labels...`);
    
    // Clean up existing labels first
    cleanupLabels();
    
    let renderedCount = 0;
    let skippedCount = 0;
    
    // Create sprite for each labeled object
    labelData.labeled_objects.forEach(obj => {
        if (!obj.label_3d || !obj.label_3d.position) {
            skippedCount++;
            return;
        }
        
        // ONLY render labels calculated in webapp (at the end of debug lines)
        if (!obj.label_3d.calculated_in_webapp) {
            console.warn(`⚠️ Skipping ${obj.class_name}: Not calculated in webapp`);
            skippedCount++;
            return;
        }
        
        const label = obj.label_3d;
        const text = label.text;
        const color = label.color;
        const position = label.position; // This is the line endpoint position
        
        // Create sprite
        const sprite = createLabelSprite(text, color);
        
        // Use position DIRECTLY - it's already in world coordinates (line endpoint)
        // NO transformation needed - position is already correct from webapp calculation
        sprite.position.set(position[0], position[1], position[2]);
        
        // Store reference
        labelSprites.push(sprite);
        
        // Add to scene (initially hidden if toggle is off)
        sprite.visible = labelsVisible;
        scene.add(sprite);
        
        renderedCount++;
    });
    
    console.log(`✓ Rendered ${renderedCount} label sprites (skipped ${skippedCount})`);
    console.log(`   📍 Labels positioned at debug line endpoints (white end)`);
    console.log(`   🎯 Each label is at the exact 3D position calculated from camera + depth`);
}

// Toggle semantic labels visibility
function toggleSemanticLabels(visible) {
    labelsVisible = visible;
    
    if (visible) {
        if (!labelData) {
            console.log('Label data not loaded yet');
            return;
        }
        
        // Render labels if not already rendered
        if (labelSprites.length === 0) {
            renderLabels();
        } else {
            // Just show existing sprites
            labelSprites.forEach(sprite => {
                sprite.visible = true;
            });
        }
        
        console.log(`Showing ${labelSprites.length} semantic labels`);
    } else {
        // Hide labels
        labelSprites.forEach(sprite => {
            sprite.visible = false;
        });
        
        console.log('Hiding semantic labels');
    }
}

// Toggle debug lines visibility (separate from labels)
function toggleDebugLines(visible) {
    debugLinesVisible = visible;
    
    if (debugLines) {
        debugLines.visible = visible;
        
        if (visible) {
            console.log('✓ Showing debug lines (Camera → Label)');
        } else {
            console.log('✗ Hiding debug lines');
        }
    } else {
        if (visible) {
            console.log('⚠️ Debug lines not created yet (load labels first)');
        }
    }
}

// Clean up label sprites (optionally cleanup debug lines too)
function cleanupLabels(alsoCleanupDebugLines = false) {
    labelSprites.forEach(sprite => {
        scene.remove(sprite);
        if (sprite.material.map) {
            sprite.material.map.dispose();
        }
        sprite.material.dispose();
    });
    
    labelSprites = [];
    
    // Only clean up debug lines if explicitly requested (when loading new data)
    if (alsoCleanupDebugLines && debugLines) {
        scene.remove(debugLines);
        debugLines.geometry.dispose();
        debugLines.material.dispose();
        debugLines = null;
        console.log('🧹 Cleaned up debug lines');
    }
}

// Create debug lines from best-view cameras to their labels
function createDebugLines() {
    console.log('\n📏 CREATING DEBUG LINES FROM CAMERAS TO LABELS...');
    
    // Remove existing debug lines
    if (debugLines) {
        scene.remove(debugLines);
        debugLines.geometry.dispose();
        debugLines.material.dispose();
        debugLines = null;
    }
    
    if (!labelData || !labelData.labeled_objects || labelData.labeled_objects.length === 0) {
        console.log('   No labels to draw lines for');
        return;
    }
    
    // Collect line vertices and colors
    const positions = [];
    const colors = [];
    
    let totalDistance = 0;
    let lineCount = 0;
    
    labelData.labeled_objects.forEach(obj => {
        if (!obj.label_3d || !obj.label_3d.camera_position || !obj.label_3d.calculated_in_webapp) {
            return; // Skip objects without camera position data
        }
        
        const camPos = obj.label_3d.camera_position; // [x, y, z]
        const labelPos = obj.label_3d.position; // [x, y, z]
        
        // Calculate distance
        const dx = labelPos[0] - camPos[0];
        const dy = labelPos[1] - camPos[1];
        const dz = labelPos[2] - camPos[2];
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        totalDistance += distance;
        lineCount++;
        
        // Add line vertices (from camera to label)
        positions.push(camPos[0], camPos[1], camPos[2]); // Camera position
        positions.push(labelPos[0], labelPos[1], labelPos[2]); // Label position
        
        // Yellow to white gradient (yellow at camera, white at label)
        colors.push(1.0, 1.0, 0.0); // Yellow at camera
        colors.push(1.0, 1.0, 1.0); // White at label
    });
    
    if (positions.length === 0) {
        console.log('   No valid camera-label pairs found');
        return;
    }
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Create material with vertex colors
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        linewidth: 2 // Note: linewidth > 1 only works with WebGLRenderer and not all browsers
    });
    
    // Create line segments
    debugLines = new THREE.LineSegments(geometry, material);
    debugLines.visible = debugLinesVisible; // Respect current toggle state
    scene.add(debugLines);
    
    const avgDistance = totalDistance / lineCount;
    console.log(`   ✓ Created ${lineCount} debug lines (yellow → white)`);
    console.log(`   Lines show: Best-view camera center → Label position`);
    console.log(`   Average distance: ${avgDistance.toFixed(2)}m`);
    console.log(`   Distance range: ${Math.min(...Array.from({length: lineCount}, (_, i) => {
        const camX = positions[i*6], camY = positions[i*6+1], camZ = positions[i*6+2];
        const labX = positions[i*6+3], labY = positions[i*6+4], labZ = positions[i*6+5];
        return Math.sqrt((labX-camX)**2 + (labY-camY)**2 + (labZ-camZ)**2);
    })).toFixed(2)}m - ${Math.max(...Array.from({length: lineCount}, (_, i) => {
        const camX = positions[i*6], camY = positions[i*6+1], camZ = positions[i*6+2];
        const labX = positions[i*6+3], labY = positions[i*6+4], labZ = positions[i*6+5];
        return Math.sqrt((labX-camX)**2 + (labY-camY)**2 + (labZ-camZ)**2);
    })).toFixed(2)}m\n`);
}

// Setup camera selection with raycasting
function setupCameraSelection() {
    renderer.domElement.addEventListener('click', onCameraClick);
    renderer.domElement.addEventListener('mousemove', onCameraHover);
}

// Handle camera hover for cursor feedback
function onCameraHover(event) {
    if (!cameraBodyInstances || cameraBodyInstances.length === 0 || !trajectoryData) {
        if (hoverDebugCounter++ % 60 === 0) {
            console.log('[HOVER DEBUG] No cameraBodyInstances or trajectoryData');
        }
        return;
    }
    
    // Calculate mouse position
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Check for label hover first (labels have higher priority)
    raycaster.setFromCamera(mouse, camera);
    if (labelsVisible && labelSprites.length > 0) {
        const labelIntersects = raycaster.intersectObjects(labelSprites);
        if (labelIntersects.length > 0) {
            const newHoveredLabel = labelIntersects[0].object;
            if (hoveredLabel !== newHoveredLabel) {
                // Reset previous hovered label
                if (hoveredLabel && hoveredLabel.userData.defaultScale) {
                    const ds = hoveredLabel.userData.defaultScale;
                    hoveredLabel.scale.set(ds.x, ds.y, 1);
                }
                // Highlight new hovered label (scale up 15%)
                hoveredLabel = newHoveredLabel;
                const ds = hoveredLabel.userData.defaultScale;
                hoveredLabel.scale.set(ds.x * 1.15, ds.y * 1.15, 1);
            }
            renderer.domElement.style.cursor = 'pointer';
            return; // Don't check cameras if hovering label
        } else if (hoveredLabel) {
            // Reset if no longer hovering any label
            if (hoveredLabel.userData.defaultScale) {
                const ds = hoveredLabel.userData.defaultScale;
                hoveredLabel.scale.set(ds.x, ds.y, 1);
            }
            hoveredLabel = null;
        }
    }
    
    // Check for camera intersections against individual body meshes
    const intersects = raycaster.intersectObjects(cameraBodyInstances);
    
    // Throttled debug logging (every 30 events when NOT hovering, always when hovering)
    const shouldLog = (intersects.length > 0) || (hoverDebugCounter % 30 === 0);
    hoverDebugCounter++;
    
    if (shouldLog) {
        console.log(`[HOVER DEBUG] Intersects: ${intersects.length}`, intersects.length > 0 ? '' : '');
    }
    
    // Highlight hovered camera
    if (intersects.length > 0) {
        const hoveredBody = intersects[0].object;
        const hoveredIndex = cameraBodyInstances.indexOf(hoveredBody);
        if (hoveredIndex === -1) {
            return;
        }
        renderer.domElement.style.cursor = 'pointer';
        
        console.log(`[HOVER DEBUG] ✓ Hovering over camera ${hoveredIndex}`);
        console.log(`[HOVER DEBUG] - Selected camera: ${selectedCameraIndex}`);
        console.log(`[HOVER DEBUG] - Will apply hover color: 0x${HOVER_CAMERA_COLOR.toString(16)}`);
        
        // Highlight only if not already selected
        if (hoveredIndex !== selectedCameraIndex) {
            const tempColor = new THREE.Color();
            
            console.log(`[HOVER DEBUG] - Updating colors for ${cameraBodyInstances.length} cameras`);
            
            // Update all camera colors, using stored mapping
            for (let i = 0; i < cameraBodyInstances.length; i++) {
                const trajIndex = renderPosesMapping[i];
                const pose = trajectoryData[trajIndex];
                const isBestView = pose && bestViewFrameIds.has(pose.index);
                
                if (i === selectedCameraIndex) {
                    tempColor.setHex(SELECTED_CAMERA_COLOR); // Keep selected cyan
                } else if (i === hoveredIndex) {
                    tempColor.setHex(HOVER_CAMERA_COLOR); // Hover: orange
                    console.log(`[HOVER DEBUG] - Setting camera ${i} to HOVER color (0x${HOVER_CAMERA_COLOR.toString(16)})`);
                } else {
                    tempColor.setHex(isBestView ? BEST_VIEW_CAMERA_COLOR : DEFAULT_CAMERA_COLOR);
                }
                cameraBodyInstances[i].material.color.setHex(tempColor.getHex());
                cameraLensInstances[i].material.color.setHex(tempColor.getHex()); // Update lens too!
                
                // Verify color was actually set (AFTER setColorAt)
                if (i === hoveredIndex) {
                    console.log(`[HOVER DEBUG] - Verified body color after set: #${tempColor.getHexString()}`);
                }
            }
            console.log(`[HOVER DEBUG] - Colors updated on body & lens materials`);
        } else {
            console.log(`[HOVER DEBUG] - Skipping update (camera is selected)`);
        }
    } else {
        renderer.domElement.style.cursor = 'default';
        
        // Reset all non-selected cameras to default (preserving best view colors)
        const tempColor = new THREE.Color();
        
        for (let i = 0; i < cameraBodyInstances.length; i++) {
            const trajIndex = renderPosesMapping[i];
            const pose = trajectoryData[trajIndex];
            const isBestView = pose && bestViewFrameIds.has(pose.index);
            
            if (i === selectedCameraIndex) {
                tempColor.setHex(SELECTED_CAMERA_COLOR); // Keep selected cyan
            } else {
                tempColor.setHex(isBestView ? BEST_VIEW_CAMERA_COLOR : DEFAULT_CAMERA_COLOR);
            }
            cameraBodyInstances[i].material.color.setHex(tempColor.getHex());
            cameraLensInstances[i].material.color.setHex(tempColor.getHex()); // Update lens too!
        }
    }
}

// Handle camera click for selection
function onCameraClick(event) {
    if (!cameraBodyInstances || cameraBodyInstances.length === 0 || !trajectoryData) return;
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    console.log('[CLICK DEBUG] Mouse coords:', mouse.x.toFixed(3), mouse.y.toFixed(3));
    
    // Update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Check for intersections with camera body meshes
    const intersects = raycaster.intersectObjects(cameraBodyInstances);
    
    console.log(`[CLICK DEBUG] Intersects: ${intersects.length}`);
    
    if (intersects.length > 0) {
        const body = intersects[0].object;
        const instanceId = cameraBodyInstances.indexOf(body);
        if (instanceId === -1) {
            console.log('[CLICK DEBUG] ✗ Intersected object not in cameraBodyInstances');
            return;
        }
        const trajectoryIndex = renderPosesMapping[instanceId];
        selectedCameraIndex = instanceId;
        
        console.log('[CLICK DEBUG] ✓ Selected camera:', instanceId, '→ Trajectory index:', trajectoryIndex, 'Frame index:', trajectoryData[trajectoryIndex].index);
        
        // Highlight selected camera
        highlightSelectedCamera(instanceId);
        
        // Load and display frames using the correct trajectory index
        loadCameraFrames(trajectoryIndex);
    } else {
        console.log('[CLICK DEBUG] ✗ No camera clicked');
    }
}

// Highlight the selected camera
function highlightSelectedCamera(instanceId) {
    if (!cameraBodyInstances || cameraBodyInstances.length === 0) return;
    
    // Reset all camera colors first (preserving best view yellow colors)
    const tempColor = new THREE.Color();
    const defaultColor = new THREE.Color(DEFAULT_CAMERA_COLOR);
    const bestViewColor = new THREE.Color(BEST_VIEW_CAMERA_COLOR); // Yellow
    
    // Use stored mapping instead of rebuilding
    for (let i = 0; i < cameraBodyInstances.length; i++) {
        const trajIndex = renderPosesMapping[i];
        const pose = trajectoryData[trajIndex];
        const isBestView = pose && bestViewFrameIds.has(pose.index);
        
        if (i === instanceId) {
            tempColor.setHex(SELECTED_CAMERA_COLOR); // Selected: bright cyan
        } else {
            tempColor.copy(isBestView ? bestViewColor : defaultColor);
        }
        cameraBodyInstances[i].material.color.setHex(tempColor.getHex());
        cameraLensInstances[i].material.color.setHex(tempColor.getHex()); // Update lens too!
    }
}

// Load and display camera frames
async function loadCameraFrames(cameraIndex) {
    if (!scanFolderPath || !trajectoryData) {
        console.error('❌ Scan folder path not available');
        console.log('scanFolderPath:', scanFolderPath);
        console.log('trajectoryData:', trajectoryData ? 'exists' : 'null');
        return;
    }
    
    const selectedCamera = trajectoryData[cameraIndex];
    const frameIndex = selectedCamera.index;
    
    console.log('📷 Loading frames for camera:', {
        cameraIndex,
        frameIndex,
        scanFolderPath
    });
    
    // Find the previous and next available cameras (not frame numbers)
    const framesToLoad = [];
    
    // Previous camera (if exists)
    if (cameraIndex > 0) {
        const prevCamera = trajectoryData[cameraIndex - 1];
        framesToLoad.push({
            frameNumber: prevCamera.index,
            isCurrent: false,
            label: 'Previous'
        });
    }
    
    // Current camera
    framesToLoad.push({
        frameNumber: frameIndex,
        isCurrent: true,
        label: 'Selected'
    });
    
    // Next camera (if exists)
    if (cameraIndex < trajectoryData.length - 1) {
        const nextCamera = trajectoryData[cameraIndex + 1];
        framesToLoad.push({
            frameNumber: nextCamera.index,
            isCurrent: false,
            label: 'Next'
        });
    }
    
    console.log('📋 Frames to load:', framesToLoad.map(f => `Frame ${f.frameNumber} (${f.label})`));
    
    // Display frames in viewer
    displayFrameViewer(framesToLoad, frameIndex);
}

// Display frame viewer overlay
function displayFrameViewer(frames, currentFrameIndex) {
    // Check if viewer already exists, otherwise create it
    let viewer = document.getElementById('frame-viewer');
    if (!viewer) {
        viewer = createFrameViewerUI();
    }
    
    // Clear previous content
    const gallery = viewer.querySelector('.frame-gallery');
    gallery.innerHTML = '';
    
    // Add frames to gallery
    frames.forEach(frameInfo => {
        const frameContainer = document.createElement('div');
        frameContainer.className = 'frame-container';
        if (frameInfo.isCurrent) {
            frameContainer.classList.add('current-frame');
        }
        
        // Create loading indicator
        const loader = document.createElement('div');
        loader.className = 'frame-loader';
        loader.innerHTML = '<div class="spinner"></div>';
        
        const img = document.createElement('img');
        
        // Try multiple possible paths with correct 5-digit padding
        const frameNumberPadded = String(frameInfo.frameNumber).padStart(5, '0');
        const possiblePaths = [
            `${scanFolderPath}/frame_${frameNumberPadded}.jpg`,
            `${scanFolderPath}/frame_${frameNumberPadded}.png`,
            `/cloud/Untitled_Scan_22_24_52/2025_11_10_21_44_21/frame_${frameNumberPadded}.jpg`,
            `/cloud/Untitled_Scan_22_24_52/2025_11_10_21_44_21/frame_${frameNumberPadded}.png`,
        ];
        
        console.log(`Trying to load frame ${frameInfo.frameNumber}, paths:`, possiblePaths);
        
        img.alt = `Frame ${frameInfo.frameNumber}`;
        img.style.display = 'none'; // Hide until loaded
        
        let pathIndex = 0;
        
        const tryNextPath = () => {
            if (pathIndex < possiblePaths.length) {
                const path = possiblePaths[pathIndex];
                console.log(`Attempting path: ${path}`);
                img.src = path;
                pathIndex++;
            } else {
                // All paths failed, show error
                loader.innerHTML = `<div class="frame-error">❌<br>Frame not found</div>`;
                console.error(`Failed to load frame ${frameInfo.frameNumber}`);
            }
        };
        
        img.onload = () => {
            console.log(`✓ Successfully loaded: ${img.src}`);
            loader.remove();
            img.style.display = 'block';
        };
        
        img.onerror = () => {
            console.log(`✗ Failed: ${img.src}`);
            tryNextPath();
        };
        
        // Start loading
        tryNextPath();
        
        const label = document.createElement('div');
        label.className = 'frame-label';
        const labelText = frameInfo.label || (frameInfo.isCurrent ? 'Selected' : '');
        label.textContent = `Frame ${frameInfo.frameNumber}${labelText ? ` (${labelText})` : ''}`;
        
        frameContainer.appendChild(loader);
        frameContainer.appendChild(img);
        frameContainer.appendChild(label);
        gallery.appendChild(frameContainer);
    });
    
    // Show the viewer
    viewer.classList.remove('hidden');
}

// Create frame viewer UI
function createFrameViewerUI() {
    const viewer = document.createElement('div');
    viewer.id = 'frame-viewer';
    viewer.className = 'frame-viewer';
    viewer.innerHTML = `
        <div class="frame-viewer-header">
            <h3>Camera Frames</h3>
            <button id="close-frame-viewer" class="close-btn">×</button>
        </div>
        <div class="frame-gallery"></div>
    `;
    
    document.body.appendChild(viewer);
    
    // Close button handler
    document.getElementById('close-frame-viewer').addEventListener('click', () => {
        viewer.classList.add('hidden');
        
        // Deselect camera (restore original colors including best view yellow)
        if (cameraBodyInstances && cameraBodyInstances.length > 0 && trajectoryData) {
            const tempColor = new THREE.Color();
            const defaultColor = new THREE.Color(DEFAULT_CAMERA_COLOR);
            const bestViewColor = new THREE.Color(BEST_VIEW_CAMERA_COLOR); // Yellow
            
            // Use stored mapping instead of rebuilding
            for (let i = 0; i < cameraBodyInstances.length; i++) {
                const trajIndex = renderPosesMapping[i];
                const pose = trajectoryData[trajIndex];
                const isBestView = pose && bestViewFrameIds.has(pose.index);
                tempColor.copy(isBestView ? bestViewColor : defaultColor);
                cameraBodyInstances[i].material.color.setHex(tempColor.getHex());
                cameraLensInstances[i].material.color.setHex(tempColor.getHex());
            }
        }
        selectedCameraIndex = -1;
    });
    
    return viewer;
}

// Mode management
let currentMode = 'ply';
let renovationApp = null;

// Initialize mode toggle and handle mode switching
function initModeToggle() {
    const toggleContainer = document.getElementById('mode-toggle-container');
    const plyViewerMode = document.getElementById('ply-viewer-mode');
    const renovationContainer = document.getElementById('renovation-app-container');
    
    const modeToggle = new ModeToggle((mode) => {
        currentMode = mode;
        
        if (mode === 'ply') {
            // Show PLY viewer
            plyViewerMode.style.display = 'block';
            renovationContainer.style.display = 'none';
            if (renovationApp) {
                renovationApp.hide();
            }
        } else {
            // Show Renovation app
            plyViewerMode.style.display = 'none';
            renovationContainer.style.display = 'block';
            
            if (!renovationApp) {
                renovationApp = new RenovationApp();
                const appElement = renovationApp.create();
                renovationContainer.appendChild(appElement);
            }
            renovationApp.show();
        }
    });
    
    toggleContainer.appendChild(modeToggle.create());
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initModeToggle();
    init();
    setupDragAndDrop();
    setupUI();
});

