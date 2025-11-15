# Update Main Trajectory File
# This script copies the generated trajectory to the fixed location used by the webapp

param(
    [string]$SourcePath = "cloud/trajectory.json"
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DestPath = Join-Path $ProjectRoot "camera_trajectory.json"

Write-Host "`n📷 UPDATING MAIN TRAJECTORY FILE..." -ForegroundColor Cyan

# Check if source exists
if (!(Test-Path $SourcePath)) {
    Write-Host "❌ Error: Source trajectory not found: $SourcePath" -ForegroundColor Red
    Write-Host "   Generate it first using:" -ForegroundColor Yellow
    Write-Host "   python scripts/generate_trajectory_polycam.py 11_15_2025/keyframes" -ForegroundColor Yellow
    exit 1
}

# Copy the file
try {
    Copy-Item $SourcePath $DestPath -Force
    Write-Host "✅ Trajectory copied successfully!" -ForegroundColor Green
    Write-Host "   From: $SourcePath" -ForegroundColor Gray
    Write-Host "   To:   $DestPath" -ForegroundColor Gray
    
    # Show info
    $json = Get-Content $DestPath | ConvertFrom-Json
    Write-Host "`n📊 Trajectory Info:" -ForegroundColor Cyan
    Write-Host "   - Scan Folder: $($json.scan_folder)" -ForegroundColor White
    Write-Host "   - Frame Count: $($json.frame_count)" -ForegroundColor White
    
    if ($json.scan_folder -like "*11_15_2025*") {
        Write-Host "   - Format: Polycam (timestamp-based) ✅" -ForegroundColor Green
    } else {
        Write-Host "   - Format: ARKit (frame-based)" -ForegroundColor Yellow
    }
    
    Write-Host "`n🎉 Done! The webapp will now auto-load this trajectory." -ForegroundColor Green
    Write-Host "   Just drag & drop your PLY file and it will load automatically!`n" -ForegroundColor White
    
} catch {
    Write-Host "❌ Error copying file: $_" -ForegroundColor Red
    exit 1
}

