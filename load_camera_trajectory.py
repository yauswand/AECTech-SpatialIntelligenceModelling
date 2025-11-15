import json
import os
from pathlib import Path

def load_polycam_cameras(cameras_folder):
    """
    Load Polycam camera poses from individual JSON files.
    Returns a list of camera poses with timestamp, position, rotation, and intrinsics.
    """
    cameras_path = Path(cameras_folder)
    
    if not cameras_path.exists():
        print(f"Error: Camera folder not found: {cameras_folder}")
        return None
    
    camera_files = sorted(cameras_path.glob("*.json"))
    
    if not camera_files:
        print(f"Error: No camera JSON files found in {cameras_folder}")
        return None
    
    print(f"Found {len(camera_files)} camera files")
    
    cameras = []
    
    for camera_file in camera_files:
        try:
            with open(camera_file, 'r') as f:
                data = json.load(f)
            
            # Extract transformation matrix (camera-to-world transform)
            # Format: [R | t] where R is 3x3 rotation, t is 3x1 translation
            transform = [
                [data['t_00'], data['t_01'], data['t_02'], data['t_03']],
                [data['t_10'], data['t_11'], data['t_12'], data['t_13']],
                [data['t_20'], data['t_21'], data['t_22'], data['t_23']],
                [0, 0, 0, 1]
            ]
            
            camera_pose = {
                'timestamp': data['timestamp'],
                'filename': camera_file.stem,
                'transform': transform,
                'position': [data['t_03'], data['t_13'], data['t_23']],
                'intrinsics': {
                    'fx': data['fx'],
                    'fy': data['fy'],
                    'cx': data['cx'],
                    'cy': data['cy'],
                    'width': data['width'],
                    'height': data['height']
                },
                'blur_score': data.get('blur_score', 0),
                'center_depth': data.get('center_depth', 0)
            }
            
            cameras.append(camera_pose)
            
        except Exception as e:
            print(f"Error loading {camera_file.name}: {e}")
            continue
    
    # Sort by timestamp
    cameras.sort(key=lambda x: x['timestamp'])
    
    print(f"Successfully loaded {len(cameras)} camera poses")
    print(f"Timestamp range: {cameras[0]['timestamp']} to {cameras[-1]['timestamp']}")
    
    return cameras


def save_trajectory_json(cameras, output_file):
    """
    Save camera trajectory in a format suitable for THREE.js visualization.
    """
    trajectory_data = {
        'camera_count': len(cameras),
        'cameras': []
    }
    
    for idx, cam in enumerate(cameras):
        trajectory_data['cameras'].append({
            'index': idx,
            'timestamp': cam['timestamp'],
            'filename': cam['filename'],
            'position': cam['position'],
            'transform': cam['transform'],
            'intrinsics': cam['intrinsics'],
            'blur_score': cam['blur_score'],
            'center_depth': cam['center_depth']
        })
    
    with open(output_file, 'w') as f:
        json.dump(trajectory_data, f, indent=2)
    
    print(f"\n[SUCCESS] Trajectory saved to: {output_file}")
    print(f"  Total cameras: {len(cameras)}")
    
    # Print some statistics
    positions = [cam['position'] for cam in cameras]
    
    min_x = min(p[0] for p in positions)
    max_x = max(p[0] for p in positions)
    min_y = min(p[1] for p in positions)
    max_y = max(p[1] for p in positions)
    min_z = min(p[2] for p in positions)
    max_z = max(p[2] for p in positions)
    
    print(f"\n  Position bounds:")
    print(f"    X: [{min_x:.2f}, {max_x:.2f}] meters")
    print(f"    Y: [{min_y:.2f}, {max_y:.2f}] meters")
    print(f"    Z: [{min_z:.2f}, {max_z:.2f}] meters")
    
    return trajectory_data


if __name__ == "__main__":
    # Configure paths
    cameras_folder = r"c:\Users\yashw\Desktop\simon\WebCloudRenderer\11_15_2025\keyframes\cameras"
    output_file = r"c:\Users\yashw\Desktop\simon\WebCloudRenderer\camera_trajectory.json"
    
    # Load cameras
    cameras = load_polycam_cameras(cameras_folder)
    
    if cameras:
        # Save trajectory
        trajectory_data = save_trajectory_json(cameras, output_file)
        print("\n[SUCCESS] Camera trajectory processing complete!")
    else:
        print("\n[ERROR] Failed to load cameras")

