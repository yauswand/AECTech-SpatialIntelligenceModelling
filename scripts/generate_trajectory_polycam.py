#!/usr/bin/env python3
"""
Generate camera trajectory JSON file from Polycam scan folder (adapted from old generate_trajectory.py).
This script extracts camera poses from corrected_cameras JSON files that have corresponding JPG images.
"""

import json
import os
import sys
from pathlib import Path


def generate_trajectory_json(keyframes_folder_path, output_path=None):
    """
    Extract camera poses from Polycam keyframes folder and save to JSON file.
    
    Args:
        keyframes_folder_path: Path to keyframes folder containing corrected_images/ and corrected_cameras/
        output_path: Path to output JSON file (default: trajectory.json in project root)
    """
    keyframes_folder = Path(keyframes_folder_path)
    images_folder = keyframes_folder / 'images'
    cameras_folder = keyframes_folder / 'corrected_cameras'
    
    if not images_folder.exists():
        print(f"Error: Images folder does not exist: {images_folder}")
        return False
    
    if not cameras_folder.exists():
        print(f"Error: Cameras folder does not exist: {cameras_folder}")
        return False
    
    # Find all JPG files (timestamp-based filenames)
    jpg_files = sorted(images_folder.glob("*.jpg"))
    print(f"Found {len(jpg_files)} JPG frame files")
    
    if len(jpg_files) == 0:
        print("Error: No JPG frame files found in corrected_images folder")
        return False
    
    # Extract camera poses
    poses = []
    skipped = 0
    for idx, jpg_file in enumerate(jpg_files):
        # Get timestamp from filename
        timestamp = jpg_file.stem
        json_file = cameras_folder / f"{timestamp}.json"
        
        if not json_file.exists():
            print(f"Warning: JSON file not found for {jpg_file.name}, skipping")
            skipped += 1
            continue
        
        # Load JSON data
        try:
            with open(json_file, 'r') as f:
                camera_data = json.load(f)
            
            # Build 4x4 transformation matrix from Polycam's t_XX fields
            camera_pose = [
                camera_data['t_00'], camera_data['t_01'], camera_data['t_02'], camera_data['t_03'],
                camera_data['t_10'], camera_data['t_11'], camera_data['t_12'], camera_data['t_13'],
                camera_data['t_20'], camera_data['t_21'], camera_data['t_22'], camera_data['t_23'],
                0.0, 0.0, 0.0, 1.0
            ]
            
            # Build intrinsics matrix from fx, fy, cx, cy
            intrinsics = [
                camera_data['fx'], 0.0, camera_data['cx'],
                0.0, camera_data['fy'], camera_data['cy'],
                0.0, 0.0, 1.0
            ]
            
            poses.append({
                'frame_index': int(timestamp),  # Use timestamp as frame index (matches semantic labels!)
                'cameraPoseARFrame': camera_pose,
                'intrinsics': intrinsics,
                'time': float(timestamp),  # Use timestamp as time
                'timestamp': int(timestamp)  # Store timestamp for file lookups
            })
                
        except Exception as e:
            print(f"Error reading {json_file.name}: {e}")
            skipped += 1
            continue
    
    print(f"Extracted {len(poses)} camera poses (skipped {skipped})")
    
    if len(poses) == 0:
        print("Error: No valid camera poses found")
        return False
    
    # Create output JSON
    trajectory_data = {
        'scan_folder': f'{keyframes_folder.parent.name}/keyframes',
        'frame_count': len(poses),
        'poses': poses
    }
    
    # Determine output path
    if output_path is None:
        output_path = Path(__file__).parent.parent / 'cloud' / 'trajectory.json'
    else:
        output_path = Path(output_path)
    
    # Save to file
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
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
        print("Usage: python generate_trajectory_polycam.py <keyframes_folder_path> [output_path]")
        print("\nExample:")
        print("  python generate_trajectory_polycam.py 11_15_2025/keyframes")
        print("  python generate_trajectory_polycam.py 11_15_2025/keyframes cloud/11_15_2025_trajectory.json")
        return 1
    
    keyframes_folder = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    success = generate_trajectory_json(keyframes_folder, output_path)
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())

