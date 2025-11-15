#!/usr/bin/env python3
"""
Generate camera trajectory JSON file from scan folder.
This script extracts camera poses from frame JSON files that have corresponding JPG images.
"""

import json
import os
import sys
from pathlib import Path


def generate_trajectory_json(scan_folder_path, output_path=None):
    """
    Extract camera poses from scan folder and save to JSON file.
    
    Args:
        scan_folder_path: Path to scan folder containing frame_*.json and frame_*.jpg files
        output_path: Path to output JSON file (default: trajectory.json in scan folder)
    """
    scan_folder = Path(scan_folder_path)
    
    if not scan_folder.exists():
        print(f"Error: Scan folder does not exist: {scan_folder}")
        return False
    
    # Find all JPG files
    jpg_files = sorted(scan_folder.glob("frame_*.jpg"))
    print(f"Found {len(jpg_files)} JPG frame files")
    
    if len(jpg_files) == 0:
        print("Error: No JPG frame files found in scan folder")
        return False
    
    # Extract camera poses
    poses = []
    for jpg_file in jpg_files:
        # Get corresponding JSON file
        frame_number = jpg_file.stem.replace("frame_", "")
        json_file = scan_folder / f"frame_{frame_number}.json"
        
        if not json_file.exists():
            print(f"Warning: JSON file not found for {jpg_file.name}, skipping")
            continue
        
        # Load JSON data
        try:
            with open(json_file, 'r') as f:
                frame_data = json.load(f)
            
            # Extract camera pose
            if 'cameraPoseARFrame' in frame_data and 'frame_index' in frame_data:
                poses.append({
                    'frame_index': frame_data['frame_index'],
                    'cameraPoseARFrame': frame_data['cameraPoseARFrame'],
                    'intrinsics': frame_data.get('intrinsics', None),
                    'time': frame_data.get('time', None)
                })
            else:
                print(f"Warning: Missing camera pose data in {json_file.name}")
                
        except Exception as e:
            print(f"Error reading {json_file.name}: {e}")
            continue
    
    print(f"Extracted {len(poses)} camera poses")
    
    if len(poses) == 0:
        print("Error: No valid camera poses found")
        return False
    
    # Create output JSON
    trajectory_data = {
        'scan_folder': str(scan_folder.name),
        'frame_count': len(poses),
        'poses': poses
    }
    
    # Determine output path
    if output_path is None:
        output_path = scan_folder / 'trajectory.json'
    else:
        output_path = Path(output_path)
    
    # Save to file
    try:
        with open(output_path, 'w') as f:
            json.dump(trajectory_data, f, indent=2)
        print(f"Successfully saved trajectory to: {output_path}")
        print(f"File size: {output_path.stat().st_size / 1024:.2f} KB")
        return True
    except Exception as e:
        print(f"Error saving trajectory file: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_trajectory.py <scan_folder_path> [output_path]")
        print("\nExample:")
        print("  python generate_trajectory.py E:\\WebCloudRenderer\\cloud\\Untitled_Scan_22_24_52\\2025_11_10_21_44_21")
        print("  python generate_trajectory.py E:\\WebCloudRenderer\\cloud\\Untitled_Scan_22_24_52\\2025_11_10_21_44_21 trajectory.json")
        return 1
    
    scan_folder = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    success = generate_trajectory_json(scan_folder, output_path)
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())








