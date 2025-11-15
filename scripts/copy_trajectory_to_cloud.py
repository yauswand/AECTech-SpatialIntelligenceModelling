#!/usr/bin/env python3
"""
Helper script to copy trajectory.json to the cloud folder for easier access.
"""

import shutil
from pathlib import Path


def main():
    # Source and destination paths
    source = Path(r"E:\WebCloudRenderer\cloud\Untitled_Scan_22_24_52\2025_11_10_21_44_21\trajectory.json")
    destination = Path(r"E:\WebCloudRenderer\cloud\yash_livingroom_trajectory.json")
    
    if not source.exists():
        print(f"Error: Source file not found: {source}")
        print("Please run generate_trajectory.py first!")
        return 1
    
    try:
        shutil.copy2(source, destination)
        print(f"SUCCESS: Copied trajectory file to: {destination}")
        print(f"\nYou can now load this file in the web app:")
        print(f"  1. Load the PLY file (yash_livingroom.ply)")
        print(f"  2. Click 'Load Trajectory' button")
        print(f"  3. Select: {destination.name}")
        return 0
    except Exception as e:
        print(f"Error copying file: {e}")
        return 1


if __name__ == '__main__':
    exit(main())

