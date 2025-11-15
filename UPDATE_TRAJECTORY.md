# 📷 Update Main Trajectory File

## 🎯 What This Is

The webapp now **automatically loads** the trajectory from:
```
C:\Users\yashw\Desktop\simon\WebCloudRenderer\camera_trajectory.json
```

This means you don't need to click "Load Trajectory" anymore - it loads automatically when you drag & drop a PLY file!

---

## 🔄 How to Update the Trajectory

### **Method 1: Using the PowerShell Script (Easiest)**

```powershell
# After generating a new trajectory:
.\scripts\update_main_trajectory.ps1
```

This will:
1. ✅ Copy `cloud/trajectory.json` → `camera_trajectory.json`
2. ✅ Show trajectory info (frame count, format)
3. ✅ Confirm it's ready to use

### **Method 2: Manual Copy**

```powershell
Copy-Item cloud/trajectory.json camera_trajectory.json -Force
```

---

## 🔧 Complete Workflow

### When you get new Polycam data:

```powershell
# 1. Generate trajectory from new scan
python scripts/generate_trajectory_polycam.py path/to/new_scan/keyframes

# 2. Update the main trajectory file
.\scripts\update_main_trajectory.ps1

# 3. Refresh browser and load PLY
#    Trajectory will load automatically!
```

---

## 📊 Current Trajectory Info

Run this to see what's currently loaded:

```powershell
$traj = Get-Content camera_trajectory.json | ConvertFrom-Json
Write-Host "Scan Folder: $($traj.scan_folder)"
Write-Host "Frame Count: $($traj.frame_count)"
```

**Current trajectory:**
- **Scan Folder**: `11_15_2025/keyframes`
- **Frame Count**: 478 cameras
- **Format**: Polycam (timestamp-based)

---

## 🗂️ File Locations

| File | Purpose | Tracked in Git? |
|------|---------|----------------|
| `camera_trajectory.json` | **Main trajectory** (auto-loads) | ❌ No (gitignored) |
| `cloud/trajectory.json` | Generated output | ❌ No (gitignored) |
| `scripts/generate_trajectory_polycam.py` | Generator script | ✅ Yes (committed) |
| `scripts/update_main_trajectory.ps1` | Update helper | ✅ Yes (committed) |

---

## 💡 Why This Setup?

**Benefits:**
- ✅ No manual loading - trajectory loads automatically
- ✅ Fixed path - always knows where to look
- ✅ Easy to update - one command to refresh
- ✅ Not in git - avoid committing large JSON files
- ✅ Works with any Polycam scan

---

## 🎯 Auto-Loading Order

The webapp tries these paths in order:

1. ✅ `/camera_trajectory.json` ← **Your main trajectory**
2. `/cloud/{ply_basename}_trajectory.json` ← Named match
3. `/cloud/trajectory.json` ← Generic fallback

It will use the **first one it finds**, so putting your trajectory at `camera_trajectory.json` ensures it always loads!

---

## 🔄 Switching Between Scans

To switch to a different scan:

```powershell
# Generate trajectory for new scan
python scripts/generate_trajectory_polycam.py path/to/scan2/keyframes

# Update main trajectory
.\scripts\update_main_trajectory.ps1

# Hard refresh browser (Ctrl+Shift+R)
# Load new PLY file
```

---

## ✅ Checklist

- [x] `camera_trajectory.json` exists in project root
- [x] Contains Polycam format with timestamps
- [x] Webapp configured to load it automatically
- [x] Update script available (`update_main_trajectory.ps1`)
- [x] File is gitignored (won't be committed)

**You're all set!** Just drag & drop PLY files and trajectories will load automatically! 🎉

