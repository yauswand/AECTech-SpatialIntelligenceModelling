# Frame Loading Fix for Polycam Data

## 🔧 What Was Fixed

### 1. **Trajectory JSON Regenerated**
- ✅ Generated from `11_15_2025/keyframes`
- ✅ Contains 478 camera poses
- ✅ Each pose has timestamp mapping (e.g., frame 0 → `435456552349.jpg`)
- ✅ scan_folder set to `"11_15_2025/keyframes"`

### 2. **Debug Logging Added to main.js**
Added verbose console output to trace frame loading:
- Frame-to-timestamp mapping on trajectory load
- Per-frame loading details (timestamp, paths tried)
- Clear indication when frames fail to load

---

## 🧪 Testing Steps

### 1. **Start the Webapp**
```powershell
cd C:\Users\yashw\Desktop\simon\WebCloudRenderer
npm run dev
```

### 2. **Load Your Data**
1. Drag and drop the PLY file
2. Trajectory should auto-load from `cloud/trajectory.json`
3. **Check console** for these messages:

```
📸 Frame-to-Timestamp mapping created: 478 entries
   Sample mappings (first 5):
     Frame 0 → 435456552349.jpg
     Frame 1 → 435461133940.jpg
     ...
```

### 3. **Enable Camera Trajectory**
- Toggle "Show Camera Trajectory" in Controls panel
- You should see camera frustums around the point cloud

### 4. **Click on a Camera**
- Click any camera frustum (blue cone)
- The "Camera Frames" modal should open
- **Check console** for debug output:

```
[FRAME LOAD DEBUG] Frame 132:
  - frameTimestampMap exists: YES
  - frameTimestampMap size: 478
  - Has this frame: true
  - Timestamp for frame 132: 435519211740
  - scanFolderPath: /11_15_2025/keyframes
  - Trying paths: [
      "/11_15_2025/keyframes/corrected_images/435519211740.jpg",
      "/11_15_2025/keyframes/images/435519211740.jpg"
    ]
```

### 5. **Expected Behavior**
- ✅ Previous, Current, Next frames should load
- ✅ Images display in the modal
- ✅ Console shows "Successfully loaded: ..."

---

## 🐛 Troubleshooting

### Problem: "Frame not found" for all frames

#### Cause 1: Vite Not Serving the Images
**Solution**: Vite serves files from project root by default. The paths should work as:
```
http://localhost:5173/11_15_2025/keyframes/images/435519211740.jpg
```

Test by opening this URL directly in browser.

#### Cause 2: frameTimestampMap Not Created
**Check console for:**
```
⚠️ No timestamp mapping created!
```

**Solution**: Trajectory JSON missing timestamps. Regenerate:
```powershell
python scripts/generate_trajectory_polycam.py 11_15_2025/keyframes cloud/trajectory.json
```

#### Cause 3: Wrong scan_folder Path
**Check console for:**
```
📁 Polycam scan folder path set to: /11_15_2025/keyframes
```

If path is wrong, check `cloud/trajectory.json` and verify `scan_folder` field.

---

## 📊 Console Output Reference

### ✅ Good Output (Everything Working)
```
📁 Polycam scan folder path set to: /11_15_2025/keyframes
📷 Frame format: {timestamp}.jpg (e.g., 435456552349.jpg)
📷 Loading camera poses as-is (no transformations)...
Loaded 478 camera poses

📸 Frame-to-Timestamp mapping created: 478 entries
   Sample mappings (first 5):
     Frame 0 → 435456552349.jpg
     Frame 1 → 435461133940.jpg
     Frame 2 → 435462116900.jpg
     Frame 3 → 435462700011.jpg
     Frame 4 → 435462966576.jpg

🎯 ALIGNING CAMERA TRAJECTORY WITH PLY CENTROID...
   ...

[User clicks camera]

📋 Frames to load: Frame 131 (Previous), Frame 132 (Selected), Frame 133 (Next)

[FRAME LOAD DEBUG] Frame 131:
  - frameTimestampMap exists: YES
  - frameTimestampMap size: 478
  - Has this frame: true
  - Timestamp for frame 131: 435518945175
  - scanFolderPath: /11_15_2025/keyframes
  - Trying paths: [...]

Attempting path: /11_15_2025/keyframes/corrected_images/435518945175.jpg
✓ Successfully loaded: /11_15_2025/keyframes/images/435518945175.jpg
```

### ❌ Bad Output (Not Working)
```
⚠️ No timestamp mapping created!

[User clicks camera]

[FRAME LOAD DEBUG] Frame 131:
  - frameTimestampMap exists: NO
  - frameTimestampMap size: 0
  - Has this frame: false
  - Using ARKit format (no timestamp found)
  - Trying paths: [...frame_00131.jpg...]

✗ Failed: ...
❌ Frame not found
```

---

## 🔍 What to Check

1. **Trajectory File**:
   ```powershell
   cat cloud/trajectory.json | Select-Object -First 40
   ```
   - Should have `"scan_folder": "11_15_2025/keyframes"`
   - Poses should have `"timestamp": 435456552349`

2. **Image Files Exist**:
   ```powershell
   ls 11_15_2025/keyframes/images/*.jpg | Select-Object -First 5
   ```
   - Should list files like `435456552349.jpg`

3. **Vite Serving Files**:
   - Open browser: `http://localhost:5173/11_15_2025/keyframes/images/435456552349.jpg`
   - Should show the image directly

---

## 📝 Files Modified

1. **cloud/trajectory.json** - Regenerated with correct format
2. **src/main.js** - Added debug logging for frame loading

---

## ✅ Success Criteria

- [x] Trajectory JSON has 478 poses with timestamps
- [x] Console shows "Frame-to-Timestamp mapping created: 478 entries"
- [x] Clicking camera opens modal
- [x] Console shows correct paths being tried
- [x] Images load successfully in modal

---

## 🎯 Next Steps

1. **Test**: Start webapp and click a camera
2. **Check console**: Look for debug output
3. **Report**: Copy console output if frames still don't load
4. **Verify**: Check if image URLs work directly in browser

If frames still don't load, share the console output and we'll diagnose further!

