# 🔄 Browser Cache Fix - Frame Loading Issue

## 🐛 Problem
The webapp is loading an **old cached trajectory file** instead of the new one we just generated.

**Evidence:**
- Error shows: `/cloud/Untitled_Scan_22_24_52/2025_11_10_21_44_21/images/...` ❌
- Should be: `/11_15_2025/keyframes/images/...` ✅

---

## ✅ Solution: Hard Refresh the Browser

### Windows/Linux:
Press **Ctrl + Shift + R** or **Ctrl + F5**

### Mac:
Press **Cmd + Shift + R**

This will:
1. Clear cached JavaScript and JSON files
2. Force reload of `cloud/trajectory.json`
3. Load the new Polycam trajectory with correct paths

---

## 📊 What to Look For After Refresh

### 1. **In Console - Trajectory Load:**
```
🔍 TRAJECTORY JSON LOADED:
   - scan_folder from JSON: "11_15_2025/keyframes"  ✅ (should be this!)
   - frame_count: 478
   - Has "cameras" array: NO
   - Has "poses" array: YES

✅ POLYCAM FORMAT DETECTED!  ✅ (should see this!)
📁 Polycam scan folder path set to: /11_15_2025/keyframes
📷 Frame format: {timestamp}.jpg (e.g., 435456552349.jpg)
```

### 2. **In Console - Timestamp Mapping:**
```
📸 Frame-to-Timestamp mapping created: 478 entries
   Sample mappings (first 5):
     Frame 0 → 435456552349.jpg
     Frame 1 → 435461133940.jpg
     ...
```

### 3. **When Clicking Camera:**
```
[FRAME LOAD DEBUG] Frame 132:
  - frameTimestampMap exists: YES
  - frameTimestampMap size: 478
  - Has this frame: true
  - Timestamp for frame 132: 435519211740
  - scanFolderPath: /11_15_2025/keyframes  ✅ (correct!)
  - Trying paths: [
      "/11_15_2025/keyframes/corrected_images/435519211740.jpg",
      "/11_15_2025/keyframes/images/435519211740.jpg"  ✅ (correct!)
    ]
```

---

## 🔧 If Hard Refresh Doesn't Work

### Option 1: Clear Browser Cache Completely

**Chrome:**
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

**Firefox:**
1. Ctrl + Shift + Delete
2. Check "Cache"
3. Click "Clear Now"
4. Reload page

### Option 2: Stop and Restart Dev Server

```powershell
# Stop the server (Ctrl+C in terminal)
# Then restart:
npm run dev
```

### Option 3: Check Trajectory File
Verify the file was actually updated:

```powershell
cd C:\Users\yashw\Desktop\simon\WebCloudRenderer
Get-Content cloud/trajectory.json | Select-Object -First 5
```

Should show:
```json
{
  "scan_folder": "11_15_2025/keyframes",  ✅
  "frame_count": 478,
  ...
```

---

## 🎯 Expected Result

After hard refresh:
- ✅ Console shows "POLYCAM FORMAT DETECTED!"
- ✅ scanFolderPath is `/11_15_2025/keyframes`
- ✅ frameTimestampMap has 478 entries
- ✅ Clicking cameras tries paths in `/11_15_2025/keyframes/images/`
- ✅ Frames load successfully!

---

## 📝 Quick Checklist

- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Check console for "POLYCAM FORMAT DETECTED!"
- [ ] Verify scanFolderPath is `/11_15_2025/keyframes`
- [ ] Click a camera to test
- [ ] Verify paths show `/11_15_2025/keyframes/images/...`
- [ ] Frames should load!

---

## 🆘 Still Not Working?

If after hard refresh it STILL shows the old path, check:

1. **Wrong PLY file?** Make sure you're loading the correct PLY
2. **Multiple trajectory files?** Check if there are other trajectory.json files
3. **Browser extension?** Disable cache-related browser extensions
4. **Incognito mode?** Try opening in incognito/private window

Share the console output after hard refresh and we'll debug further!

