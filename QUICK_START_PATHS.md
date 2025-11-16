# 🚀 Quick Start: Default Paths

## TL;DR - Just Do This!

### Step 1: Place Your Files Here

```
WebCloudRenderer/
├── cloud/
│   └── point_cloud.ply               ← Your .ply file
├── camera_trajectory.json             ← Your trajectory JSON
└── semantic_labeling/output/unique_objects/
    └── unique_objects_final.json      ← Your labels JSON
```

### Step 2: Refresh Browser

That's it! Everything loads automatically. 🎉

---

## 📝 File Path Cheatsheet

### 1. Point Cloud (REQUIRED)
```
Default: /cloud/point_cloud.ply
Edit in: src/main.js (Line 40)
```

### 2. Camera Trajectory (Auto-loads)
```
Priority 1: /camera_trajectory.json          ← Use this!
Priority 2: /cloud/{filename}_trajectory.json
Priority 3: /cloud/trajectory.json
Edit in: src/main.js (Line 508-512)
```

### 3. Semantic Labels (Auto-loads)
```
Priority 1: /semantic_labeling/output/unique_objects/unique_objects_final.json  ← Use this!
Priority 2: /semantic_labeling/output/labels_3d/labels_3d.json
Priority 3: /cloud/labels_3d.json
Priority 4: /cloud/semantic_labels.json
Edit in: src/main.js (Line 1540-1545)
```

---

## 🔄 Loading a New Model

### Easy Way (Recommended)
```powershell
# Replace the files with your new model
Copy-Item "my_new_scan.ply" -Destination "cloud/point_cloud.ply" -Force
Copy-Item "my_trajectory.json" -Destination "camera_trajectory.json" -Force
Copy-Item "my_labels.json" -Destination "semantic_labeling/output/unique_objects/unique_objects_final.json" -Force

# Refresh browser (Ctrl+R)
```

### Manual Way
Just drag and drop the `.ply` file into the browser window!

---

## 🛠️ Customizing Default Paths

### Change Point Cloud Path

Edit `src/main.js` line 40:
```javascript
const DEFAULT_POINT_CLOUD_PATH = '/your/custom/path.ply';
```

### Change Trajectory Paths

Edit `src/main.js` around line 508:
```javascript
const possibleTrajectoryPaths = [
    `/your/trajectory.json`,  // Try this first
    `/backup/trajectory.json` // Then try this
];
```

### Change Labels Paths

Edit `src/main.js` around line 1540:
```javascript
const possibleLabelPaths = [
    `/your/labels.json`,  // Try this first
    `/backup/labels.json` // Then try this
];
```

---

## ❌ Disable Auto-Loading

Set to `null` in `src/main.js`:
```javascript
const DEFAULT_POINT_CLOUD_PATH = null;
```

Then use drag-and-drop to manually load files.

---

## 🔍 Console Messages to Look For

### ✅ Success
```
☁️  AUTO-LOADING POINT CLOUD...
✅ Found point cloud file: /cloud/point_cloud.ply
✨ Point cloud loaded automatically!

📷 AUTO-LOADING CAMERA TRAJECTORY...
✅ Found trajectory file: /camera_trajectory.json
✨ Trajectory loaded and displayed automatically!

🏷️ AUTO-LOADING SEMANTIC LABELS...
✅ Found labels file: /semantic_labeling/output/unique_objects/unique_objects_final.json
✨ Semantic labels loaded and calculated in webapp!
```

### ⚠️ File Not Found
```
⚠️  Could not auto-load point cloud from /cloud/point_cloud.ply
   Error: HTTP error! status: 404
   You can manually load a .ply file by dragging and dropping it onto the window.
```

**Solution**: Check file path and make sure file exists!

---

## 📊 Visual Flow

```
App Starts
    ↓
☁️ Load Point Cloud (/cloud/point_cloud.ply)
    ↓
📷 Load Trajectory (tries /camera_trajectory.json first)
    ↓
🏷️ Load Labels (tries /semantic_labeling/.../unique_objects_final.json first)
    ↓
✅ Ready!
```

---

## 💡 Pro Tips

1. **Keep filenames consistent**: Always name your main files the same way
2. **Use symbolic links**: On Windows, use mklink to point to different files:
   ```powershell
   mklink "cloud\point_cloud.ply" "C:\MyScans\latest.ply"
   ```
3. **Batch script**: Create a script to swap models quickly:
   ```powershell
   # load_model.ps1
   param($modelName)
   Copy-Item "models\$modelName.ply" -Destination "cloud\point_cloud.ply"
   Copy-Item "models\${modelName}_trajectory.json" -Destination "camera_trajectory.json"
   Write-Host "✅ Model loaded! Refresh your browser."
   ```

4. **Check browser console**: Press F12 to see loading progress and errors

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Nothing loads | Check file exists at `/cloud/point_cloud.ply` |
| Point cloud loads, but no trajectory | Check `/camera_trajectory.json` exists |
| Trajectory loads, but no labels | Check `/semantic_labeling/output/unique_objects/unique_objects_final.json` exists |
| Can't see frame images | Check `scan_folder` path in trajectory JSON |

---

**See `DEFAULT_PATHS.md` for complete documentation!**

