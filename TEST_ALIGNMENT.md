# Quick Test Guide - Polycam Alignment Fix

## 🧪 How to Test the Alignment

### Prerequisites
- Polycam PLY file (e.g., `model.ply`)
- Camera trajectory JSON (generated from Polycam data)

### Step-by-Step Test

#### 1. **Start the Webapp**
```powershell
cd C:\Users\yashw\Desktop\simon\WebCloudRenderer
npm run dev
```

#### 2. **Load PLY File**
- Drag and drop your PLY file into the webapp
- Open browser console (F12)
- Look for this message:
  ```
  📍 PLY CENTROID CALCULATED: [x.xxx, y.yyy, z.zzz]
     This will be used to align camera trajectories from Polycam
  ```

#### 3. **Load Camera Trajectory**
- Either auto-loads or use "Load Trajectory" button
- Watch console for alignment messages:
  ```
  🎯 ALIGNING CAMERA TRAJECTORY WITH PLY CENTROID...
     Camera poses: XXX
  
     📍 PLY Centroid:    [x.xxx, y.yyy, z.zzz]
     📷 Camera Centroid: [a.aaa, b.bbb, c.ccc]
  
     🔧 Translation Vector: [dx, dy, dz]
     📏 Translation Distance: N.NNN meters
  
     🔄 Applying translation to XXX camera poses...
  
     ✅ ALIGNMENT COMPLETE!
     📍 New Camera Centroid: [x.xxx, y.yyy, z.zzz]
     📊 Alignment Error: 0.000XXX meters
     🎯 Cameras are now aligned with PLY coordinate system!
  ```

#### 4. **Visual Verification**

**Expected Results:**
- ✅ Camera trajectory (purple/cyan tube) wraps around the point cloud
- ✅ Camera frustums (blue cones) point at the model
- ✅ Cameras are centered on the point cloud (not floating in space)
- ✅ Yellow cameras (best views) are inside or near the model

**Toggle Visualization:**
- Enable "Show Camera Trajectory" in Controls panel
- Enable "Show Debug Lines" (if labels are loaded)

#### 5. **Numeric Verification**

**Good alignment indicators:**
```
📊 Alignment Error: 0.000XXX meters    ← Should be very small (< 0.001m)
📏 Translation Distance: X.XXX meters   ← Polycam offset (typically 1-5m)
```

**Bad alignment indicators:**
```
⚠️ WARNING: Point cloud not loaded yet!
```
→ Load PLY first, then trajectory

---

## 🐛 Troubleshooting

### Problem: Cameras still far from point cloud
**Cause**: Trajectory loaded before PLY
**Solution**: Reload trajectory after PLY is loaded

### Problem: No alignment messages in console
**Cause**: Using old trajectory JSON or old main.js
**Solution**: 
1. Regenerate trajectory: `python scripts/generate_trajectory_polycam.py 11_15_2025/keyframes`
2. Hard refresh webapp (Ctrl+Shift+R)

### Problem: Alignment error > 0.01 meters
**Cause**: Unexpected - possible data mismatch
**Solution**: Check that PLY and trajectory are from the same Polycam scan

---

## 📊 Expected Console Output (Full Example)

```
📦 POINT CLOUD LOADED:
   Applying -90° rotation around X-axis (LOCKED)...
   Bounding Box Min: [-2.50, -1.80, -0.50]
   Bounding Box Max: [2.50, 1.80, 2.50]

   📍 PLY CENTROID CALCULATED: [0.012, 0.034, 0.891]
   This will be used to align camera trajectories from Polycam

---

📷 AUTO-LOADING CAMERA TRAJECTORY...
Trying: /cloud/trajectory.json
✅ Found trajectory file: /cloud/trajectory.json
Loading camera trajectory...
📁 Polycam scan folder path set to: /11_15_2025/keyframes
📷 Frame format: {timestamp}.jpg (e.g., 435456552349.jpg)
📷 Loading camera poses as-is (no transformations)...
Loaded 245 camera poses

🔗 Point cloud loaded - aligning camera trajectory...

🎯 ALIGNING CAMERA TRAJECTORY WITH PLY CENTROID...
   Camera poses: 245

   📍 PLY Centroid:    [0.012, 0.034, 0.891]
   📷 Camera Centroid: [2.345, -1.234, 3.567]

   🔧 Translation Vector: [-2.333, 1.268, -2.676]
   📏 Translation Distance: 3.892 meters

   🔄 Applying translation to 245 camera poses...

   ✅ ALIGNMENT COMPLETE!
   📍 New Camera Centroid: [0.012, 0.034, 0.891]
   📊 Alignment Error: 0.000000 meters
   🎯 Cameras are now aligned with PLY coordinate system!

📊 Trajectory Summary:
   poseCount: 245
   firstPosition: [-1.23, 0.45, -0.67]
   lastPosition: [1.34, -0.56, 1.78]

✨ Trajectory loaded and displayed automatically!
💡 TIP: Click on any camera icon to view its captured frames!
```

---

## ✅ Success Criteria

Your alignment is successful if:

1. ✅ Alignment Error < 0.001 meters (sub-millimeter)
2. ✅ New Camera Centroid ≈ PLY Centroid (within 0.01m)
3. ✅ Camera trajectory visually wraps around model
4. ✅ Camera frustums point toward point cloud
5. ✅ Clicking cameras shows frames that match 3D positions

---

## 🎉 You're Done!

The Polycam camera alignment fix is working! 

No more manual preprocessing - just drag, drop, and visualize! 🚀

