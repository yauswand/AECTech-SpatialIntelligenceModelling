# 📁 Folder Upload Guide

## Overview

The WebCloudRenderer now supports uploading entire scan folders using the **File System Access API**. This allows you to load point clouds, trajectories, and frame images directly from your local filesystem without needing to serve files through a web server.

---

## 🗂️ Required Folder Structure

Your scan folder must follow this structure:

```
11_15_2025/                          ← Root folder (you'll select this)
├── 11_15_2025.ply                   ← Point cloud file (.ply)
├── camera_trajectory.json           ← Camera trajectory (MUST be in root)
└── keyframes/                       ← Keyframes subfolder
    ├── images/                      ← RGB images (timestamp.jpg)
    │   ├── 435456552349.jpg
    │   ├── 435456552350.jpg
    │   └── ...
    └── cameras/                     ← Camera JSON files (timestamp.json)
        ├── 435456552349.json
        ├── 435456552350.json
        └── ...
```

### Alternative folder names (fallbacks):
- `corrected_images/` instead of `images/`
- `corrected_cameras/` instead of `cameras/`

---

## 🚀 How to Use

### Step 1: Generate Camera Trajectory

Run this command from your project root:

```powershell
python scripts/generate_trajectory_polycam.py 11_15_2025/keyframes 11_15_2025/camera_trajectory.json
```

**Important**: The trajectory JSON must be saved in the **root of your scan folder** (e.g., `11_15_2025/camera_trajectory.json`), NOT in a separate location!

This will:
- Read camera poses from `11_15_2025/keyframes/cameras/`
- Read image timestamps from `11_15_2025/keyframes/images/`
- Create `11_15_2025/camera_trajectory.json` with proper mapping

### Step 2: Upload Folder in Browser

1. Open the WebCloudRenderer in your browser
2. Click the **"Select Data Folder"** button
3. Navigate to and select your scan folder (e.g., `11_15_2025/`)
4. Browser will validate the folder structure
5. Everything loads automatically!

---

## 🔧 What Happens When You Upload

The app will automatically:

1. ✅ **Validate folder structure**
   - Checks for `.ply` file in root
   - Checks for `camera_trajectory.json` in root
   - Checks for `keyframes/` folder
   - Checks for `images/` and `cameras/` subfolders

2. ✅ **Load point cloud**
   - Loads the `.ply` file from the folder
   - Calculates centroid for alignment
   - Applies coordinate transformations

3. ✅ **Load trajectory**
   - Reads `camera_trajectory.json` from folder root
   - Parses camera poses and timestamps
   - Aligns cameras with point cloud centroid

4. ✅ **Setup frame viewer**
   - Connects to `keyframes/images/` folder
   - Maps frame indices to timestamps
   - Enables clicking cameras to view frames

5. ✅ **Display everything**
   - Shows point cloud
   - Shows camera trajectory (blue icons)
   - Ready to click cameras and view frames

---

## 📷 Viewing Frame Images

After uploading:

1. **Cameras appear** as blue 3D icons along the trajectory
2. **Click any camera** to open the frame viewer
3. **Frame viewer shows**:
   - Previous frame (if exists)
   - Selected frame (current)
   - Next frame (if exists)
4. **Images load** directly from your folder (no internet needed!)

---

## ⚙️ Technical Details

### File System Access API

The app uses the **File System Access API** (Chrome/Edge only) to read files directly from your filesystem:

- No files are uploaded to a server
- No network requests (except for the app itself)
- Reads happen client-side in your browser
- Requires permission grant (one-time per folder)

### Frame Loading

When you click a camera:
- App looks up the frame index → timestamp mapping
- Requests `{timestamp}.jpg` from the `images/` folder handle
- Browser shows native file picker permissions
- Image displays in frame viewer

### Path Resolution

The app uses a special marker `scanFolderPath = 'folder-handle'` to indicate folder upload mode:

```javascript
if (scanFolderPath === 'folder-handle') {
    // Load from folder handle
    const url = await loadImageFromFolder(`${timestamp}.jpg`);
} else {
    // Load from URL path (old method)
    const url = `${scanFolderPath}/images/${timestamp}.jpg`;
}
```

---

## 🐛 Troubleshooting

### Folder validation fails

**Problem**: "Invalid folder structure" error

**Solutions**:
- Make sure `camera_trajectory.json` is in the **root** of your folder (NOT in a subfolder)
- Make sure `.ply` file is in the **root**
- Make sure `keyframes/` folder exists
- Make sure `keyframes/images/` OR `keyframes/corrected_images/` exists
- Make sure `keyframes/cameras/` OR `keyframes/corrected_cameras/` exists

### Frames not loading

**Problem**: "Frame not found" error when clicking cameras

**Solutions**:
- Check that images are named with timestamps (e.g., `435456552349.jpg`)
- Check that timestamp mapping exists in trajectory JSON
- Check browser console for specific file paths being tried
- Make sure image files are `.jpg` format

### Wrong trajectory showing

**Problem**: Old trajectory appears instead of uploaded one

**Solution**: This is now fixed! The app will:
- Skip URL-based trajectory fetching when using folder upload
- Only load trajectory from the uploaded folder
- Override any previous trajectory data

### Frame images rotated wrong

**Problem**: Frame images appear sideways

**Solution**: The app automatically rotates images 90° for proper display:
```javascript
img.style.transform = 'rotate(90deg)';
```

---

## 📝 Example Workflow

```powershell
# 1. Generate trajectory (from project root)
python scripts/generate_trajectory_polycam.py 11_15_2025/keyframes 11_15_2025/camera_trajectory.json

# Output:
# Found 164 JPG frame files
# Extracted 164 camera poses (skipped 0)
# Successfully saved trajectory to: 11_15_2025\camera_trajectory.json

# 2. Open browser and click "Select Data Folder"

# 3. Navigate to and select "11_15_2025" folder

# 4. App loads everything automatically!

# 5. Click any blue camera icon to view frames
```

---

## 🆚 Folder Upload vs URL Loading

| Feature | Folder Upload | URL Loading (old) |
|---------|--------------|-------------------|
| **File location** | Local filesystem | Web server |
| **Network needed** | No | Yes |
| **Permission** | One-time grant | None (public) |
| **Browser support** | Chrome/Edge | All browsers |
| **Setup** | Select folder | Configure paths |
| **Trajectory source** | From folder | Hardcoded URL |
| **Frame images** | From folder | Hardcoded URL |

---

## 💡 Best Practices

1. **Keep everything organized**: Use consistent folder naming
2. **Generate trajectory first**: Always run the generation script before uploading
3. **Check console logs**: Press F12 to see detailed loading progress
4. **One folder per scan**: Keep each scan in its own folder with all files
5. **Don't move files**: After selecting a folder, don't rename/move files

---

## 🔒 Privacy & Security

- **No uploads**: Files stay on your computer
- **Read-only**: App only reads, never writes
- **Permission-based**: You explicitly grant access to each folder
- **Revokable**: Can revoke permissions anytime in browser settings

---

## 📞 Support

If you encounter issues:

1. Open browser console (F12)
2. Look for error messages (red text)
3. Check folder structure matches requirements
4. Verify trajectory JSON is valid
5. Try refreshing and re-selecting folder

**Common console messages**:
- ✅ `Folder structure validated successfully!`
- ✅ `ALL DATA LOADED SUCCESSFULLY!`
- ❌ `Invalid folder structure`
- ❌ `camera_trajectory.json not found in root folder`

---

**Last Updated**: 2025-11-16  
**Version**: 2.0 (Folder Upload Support)

