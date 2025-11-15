# PLY Point Cloud Viewer

A beautiful web-based 3D point cloud viewer for PLY files, built with Three.js. Features a sleek dark interface with smooth interactions and stunning visual effects.

![PLY Point Cloud Viewer](https://img.shields.io/badge/Three.js-black?style=flat&logo=three.js)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)

## Features

- 🎨 **Stunning Visuals**: Point clouds rendered with a cool wireframe aesthetic on a black background
- 🖱️ **Interactive Controls**: Smooth orbit controls for rotating, panning, and zooming
- 📁 **Drag & Drop**: Simply drag and drop any .ply file to visualize it
- 🎯 **Auto-Centering**: Automatically centers and scales models to fit the viewport
- 🌈 **Color Support**: Displays vertex colors from PLY files or generates beautiful gradients
- 📱 **Responsive**: Works on desktop and mobile devices
- ⚡ **Fast Loading**: Efficient rendering even for large point clouds

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`)

### Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory. You can preview the production build with:

```bash
npm run preview
```

## Usage

1. **Launch the app** - Open the viewer in your browser
2. **Close the welcome screen** - Click "Got it!" to dismiss the instructions
3. **Drag and drop** - Drag any .ply file from your computer onto the browser window
4. **Interact** - Use your mouse or touch gestures to explore:
   - **Left click + drag**: Rotate the view
   - **Right click + drag** (or two-finger drag): Pan the view
   - **Scroll** (or pinch): Zoom in/out

## Controls

| Action | Mouse | Touch |
|--------|-------|-------|
| Rotate | Left click + drag | One finger drag |
| Pan | Right click + drag | Two finger drag |
| Zoom | Scroll wheel | Pinch |

## PLY File Format

This viewer supports standard PLY (Polygon File Format) files with:
- ASCII or binary encoding
- Vertex positions
- Optional vertex colors
- Optional face data

The viewer primarily focuses on vertex/point cloud visualization.

## Technology Stack

- **Three.js** - 3D rendering engine
- **Vite** - Build tool and dev server
- **Vanilla JavaScript** - No framework overhead, fast and simple

## Project Structure

```
ply-point-cloud-viewer/
├── src/
│   ├── main.js          # Main application logic
│   └── style.css        # Styles and animations
├── index.html           # HTML entry point
├── package.json         # Dependencies and scripts
└── README.md           # Documentation
```

## Customization

### Adjust Point Size

In `src/main.js`, modify the `PointsMaterial` size parameter:

```javascript
const material = new THREE.PointsMaterial({
    size: 0.02,  // Change this value
    // ...
});
```

### Change Background Color

In `src/main.js`, modify the scene background:

```javascript
scene.background = new THREE.Color(0x000000);  // Black (default)
```

### Modify Color Gradient

The default gradient goes from blue to purple. Edit the color generation in `loadPLYFile()`:

```javascript
color.setHSL(0.6 - normalized * 0.15, 0.8, 0.5 + normalized * 0.3);
```

## Browser Compatibility

Works on all modern browsers that support WebGL:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Tips

- For very large point clouds (>10M vertices), consider decimating the model first
- The viewer uses additive blending for a glowing effect, which may impact performance on lower-end devices
- Adjust the `size` and `opacity` values in the material for performance tuning

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Acknowledgments

- Built with [Three.js](https://threejs.org/)
- Developed using [Vite](https://vitejs.dev/)

---

Enjoy visualizing your 3D point clouds! 🚀










