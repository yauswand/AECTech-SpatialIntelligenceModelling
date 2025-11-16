"""
Analyze YOLO Detections with Qwen VLM
Extracts structured architectural, spatial and decor analysis for each detected object
"""
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import time

# Add parent directory to path to import modules
sys.path.append(str(Path(__file__).parent.parent))

from semantic_labeling import config
from semantic_labeling.vlm_client import OpenRouterVLMClient


class DetectionAnalyzer:
    """Analyze YOLO detections using Qwen VLM"""
    
    def __init__(self, 
                 label_positions_path: Path,
                 images_dir: Path,
                 output_dir: Path,
                 model: Optional[str] = None,
                 max_parallel: int = 10,
                 max_retries: int = 3):
        """
        Initialize detection analyzer
        
        Args:
            label_positions_path: Path to label_positions_refined.json
            images_dir: Directory containing detection images (keyframe images or crops)
            output_dir: Directory to save analysis JSON files
            model: VLM model to use (defaults to config)
            max_parallel: Maximum number of parallel requests
            max_retries: Maximum retry attempts per request
        """
        self.label_positions_path = Path(label_positions_path)
        self.images_dir = Path(images_dir)
        self.output_dir = Path(output_dir)
        self.max_parallel = max_parallel
        self.max_retries = max_retries
        
        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize VLM client with Qwen
        self.client = OpenRouterVLMClient(model=model or config.OPENROUTER_MODEL)
        
        # Thread-safe progress tracking
        self.progress_lock = threading.Lock()
        self.progress_bar = None
        
        # Load label positions
        print(f"\nLoading label positions from: {self.label_positions_path}")
        with open(self.label_positions_path, 'r') as f:
            self.label_data = json.load(f)
        
        print(f"Loaded {len(self.label_data)} labeled objects")
        print(f"Images directory: {self.images_dir}")
        print(f"Output directory: {self.output_dir}")
        print(f"VLM Model: {self.client.model}")
        print(f"Parallel requests: {self.max_parallel}\n")
    
    def analyze_detection_with_retry(self, object_id: str, obj_data: Dict, 
                                    image_path: Path) -> Dict:
        """
        Analyze detection with exponential backoff and retries
        
        Args:
            object_id: Object ID
            obj_data: Object data from label_positions
            image_path: Path to detection image
            
        Returns:
            Analysis dictionary
        """
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                return self._analyze_detection_impl(object_id, obj_data, image_path)
            except Exception as e:
                last_error = e
                
                if attempt < self.max_retries - 1:
                    delay = 1.0 * (2 ** attempt)  # Exponential backoff
                    
                    with self.progress_lock:
                        print(f"  ⚠ Attempt {attempt + 1} failed for {object_id}: {str(e)}")
                        print(f"  ⏳ Retrying in {delay:.1f}s...")
                    
                    time.sleep(delay)
                else:
                    with self.progress_lock:
                        print(f"  ❌ All {self.max_retries} attempts failed for {object_id}")
        
        # All retries failed - return error result
        return {
            'object_id': object_id,
            'label': obj_data.get('label', 'unknown'),
            'error': f"Failed after {self.max_retries} attempts: {str(last_error)}",
            'analysis': None
        }
    
    def _classify_object_type(self, object_id: str, label: str, 
                              image_path: Path) -> Dict:
        """
        Classify if object is architectural/interior/furniture related or general
        
        Args:
            object_id: Object ID
            label: Object label
            image_path: Path to detection image
            
        Returns:
            Classification result dictionary
        """
        classification_prompt = f"""You are an object classification expert. Classify if this object is related to architecture, interior design, or furniture.

OBJECT INFORMATION:
- Object ID: {object_id}
- Detected Label: "{label}"

TASK: Determine if this object falls into one of these categories:
1. ARCHITECTURAL/INTERIOR/FURNITURE: Objects that are part of building architecture, interior design, furniture, fixtures, or decor
   Examples: chairs, tables, cabinets, lamps, curtains, pictures, plants, doors, windows, walls, shelves, etc.

2. GENERAL OBJECTS: Other objects that are not architectural/interior elements
   Examples: food items, snacks, personal items, electronic devices (phones, laptops), bags, clothing, books, toys, etc.

Return ONLY a JSON response with this EXACT format:
{{
    "is_architectural_interior": true/false,
    "category": "architectural/interior/furniture" or "general object",
    "reasoning": "brief explanation of classification",
    "confidence": 0.0-1.0
}}"""

        try:
            result = self.client.query_json(classification_prompt, [image_path], max_tokens=200)
            return result
        except Exception as e:
            # Default to architectural if classification fails
            return {
                "is_architectural_interior": True,
                "category": "architectural/interior/furniture",
                "reasoning": f"Classification failed, defaulting to architectural: {str(e)}",
                "confidence": 0.5
            }
    
    def _analyze_detection_impl(self, object_id: str, obj_data: Dict, 
                                image_path: Path) -> Dict:
        """
        Internal implementation of detection analysis
        
        Args:
            object_id: Object ID
            obj_data: Object data from label_positions
            image_path: Path to detection image
            
        Returns:
            Analysis dictionary
        """
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # Extract detection info
        label = obj_data.get('label', 'unknown')
        confidence = obj_data.get('confidence', 0.0)
        direction = obj_data.get('direction', None)
        original_label = obj_data.get('original_label', None)
        verification = obj_data.get('verification', None)
        
        # Build detection information string
        detection_info = f"""DETECTED OBJECT INFORMATION:
- Object ID: {object_id}
- Current Label: "{label}"
- Detection Confidence: {confidence:.3f}
- 3D Position: {"Available" if direction else "Not available"}"""
        
        # Add original label and verification info if available
        if original_label:
            detection_info += f"\n- Original Label: \"{original_label}\" (corrected to \"{label}\")"
        
        if verification:
            verified_status = verification.get('verified', False)
            reasoning = verification.get('reasoning', 'N/A')
            detection_info += f"\n- Verification Status: {'Verified' if verified_status else 'Not verified'}"
            detection_info += f"\n- Verification Notes: {reasoning}"
        
        # STEP 1: Classify object type
        classification = self._classify_object_type(object_id, label, image_path)
        is_architectural = classification.get('is_architectural_interior', True)
        
        # STEP 2: Choose appropriate analysis prompt based on classification
        if is_architectural:
            # Use comprehensive architectural analysis
            prompt = f"""You are an expert architectural and interior design analyst. Analyze this detected object in detail.

{detection_info}
Classification: {classification.get('category', 'architectural/interior/furniture')}

TASK: Provide a comprehensive analysis of this object covering:

1. OBJECT IDENTIFICATION:
   - Verify the detected label is accurate
   - Provide specific object type/subtype (e.g., "ergonomic office chair" vs just "chair")
   - Note any distinctive features or characteristics

2. ARCHITECTURAL CONTEXT:
   - Object category (furniture, fixture, decor, architectural element, appliance, etc.)
   - Typical location/room type where this object is found
   - Architectural style or design period (if identifiable)
   - Structural or functional role in the space

3. SPATIAL ANALYSIS:
   - Approximate size/scale (small, medium, large, extra-large)
   - Orientation and positioning in the visible space
   - Relationship to other visible objects or architectural elements
   - Placement relative to walls, floor, ceiling (if visible)

4. MATERIAL & FINISH:
   - Primary materials used (wood, metal, fabric, glass, plastic, etc.)
   - Material quality indicators (high-end, standard, budget)
   - Surface finish (polished, matte, textured, painted, natural, etc.)
   - Color palette and tones

5. STYLE & DESIGN:
   - Design style (modern, traditional, industrial, minimalist, etc.)
   - Design era or period (contemporary, mid-century, vintage, etc.)
   - Aesthetic qualities and visual appeal
   - Design complexity (simple, ornate, minimalist, decorative)

6. CONDITION & MAINTENANCE:
   - Visible condition (new, well-maintained, worn, damaged)
   - Cleanliness and upkeep level
   - Signs of wear, age, or damage (if any)

7. FUNCTIONAL ANALYSIS:
   - Primary function and purpose
   - Usage context (residential, commercial, institutional)
   - Ergonomic considerations (if applicable)
   - Multi-functional or single-purpose

8. DECORATIVE ELEMENTS:
   - Decorative features or embellishments
   - Visual weight and presence in the space
   - Contribution to overall aesthetics
   - Coordination with surrounding elements

9. QUALITY & VALUE INDICATORS:
   - Build quality assessment
   - Estimated value category (budget, mid-range, premium, luxury)
   - Brand or manufacturer indicators (if visible)
   - Craftsmanship quality

10. CONTEXTUAL NOTES:
    - Any unique or notable characteristics
    - Cultural or regional design influences
    - Sustainability or eco-friendly features (if visible)
    - Any other relevant observations

Return your analysis as a JSON object with this EXACT structure:
{{
    "object_identification": {{
        "verified_label": "accurate label",
        "specific_type": "detailed object type",
        "distinctive_features": ["feature1", "feature2"]
    }},
    "architectural_context": {{
        "category": "category name",
        "typical_location": "room type or location",
        "architectural_style": "style description",
        "functional_role": "role description"
    }},
    "spatial_analysis": {{
        "size_scale": "size category",
        "orientation": "orientation description",
        "relationship_to_space": "spatial relationship",
        "placement": "placement description"
    }},
    "material_finish": {{
        "primary_materials": ["material1", "material2"],
        "quality_level": "quality description",
        "surface_finish": "finish description",
        "color_palette": ["color1", "color2"]
    }},
    "style_design": {{
        "design_style": "style name",
        "design_era": "era description",
        "aesthetic_qualities": ["quality1", "quality2"],
        "design_complexity": "complexity level"
    }},
    "condition_maintenance": {{
        "visible_condition": "condition description",
        "cleanliness": "cleanliness level",
        "wear_damage": "wear description or 'none visible'"
    }},
    "functional_analysis": {{
        "primary_function": "function description",
        "usage_context": "usage context",
        "ergonomic_notes": "ergonomic assessment or 'not applicable'",
        "functionality": "single-purpose or multi-functional"
    }},
    "decorative_elements": {{
        "features": ["feature1", "feature2"],
        "visual_weight": "weight description",
        "aesthetic_contribution": "contribution description",
        "coordination": "coordination assessment"
    }},
    "quality_value": {{
        "build_quality": "quality assessment",
        "value_category": "value category",
        "brand_indicators": "brand notes or 'not visible'",
        "craftsmanship": "craftsmanship assessment"
    }},
    "contextual_notes": {{
        "unique_characteristics": ["note1", "note2"],
        "cultural_influences": "cultural notes or 'not apparent'",
        "sustainability_features": "sustainability notes or 'not visible'",
        "additional_observations": ["observation1", "observation2"]
    }},
    "confidence_score": 0.0-1.0,
    "analysis_notes": "any additional important notes"
}}

Be thorough, specific, and accurate in your analysis. If certain information cannot be determined from the image, state that clearly."""
        else:
            # Use simpler general object analysis
            prompt = f"""You are an object analysis expert. Analyze this general object in detail.

{detection_info}
Classification: {classification.get('category', 'general object')}

TASK: Provide a concise analysis of this object covering:

1. OBJECT IDENTIFICATION:
   - Verify the detected label is accurate
   - Provide specific object type/description
   - Note distinctive features or characteristics

2. PHYSICAL ATTRIBUTES:
   - Size and dimensions (approximate)
   - Primary materials and construction
   - Color and visual appearance
   - Condition (new, used, worn, etc.)

3. FUNCTIONAL ANALYSIS:
   - Primary purpose and function
   - Typical usage context
   - User interaction (how it's used)

4. CONTEXTUAL INFORMATION:
   - Typical location where this object is found
   - Brand or manufacturer (if visible)
   - Estimated value category (budget, mid-range, premium)

5. OBSERVATIONS:
   - Any unique or notable characteristics
   - Relationship to surrounding environment (if visible)
   - Any other relevant details

Return your analysis as a JSON object with this EXACT structure:
{{
    "object_identification": {{
        "verified_label": "accurate label",
        "specific_type": "detailed object description",
        "distinctive_features": ["feature1", "feature2"]
    }},
    "physical_attributes": {{
        "size_dimensions": "size description",
        "materials": ["material1", "material2"],
        "color_appearance": "color and appearance description",
        "condition": "condition description"
    }},
    "functional_analysis": {{
        "primary_function": "function description",
        "usage_context": "where/how it's used",
        "user_interaction": "interaction description"
    }},
    "contextual_information": {{
        "typical_location": "where found",
        "brand_manufacturer": "brand if visible or 'not visible'",
        "value_category": "value estimate"
    }},
    "observations": {{
        "unique_characteristics": ["characteristic1", "characteristic2"],
        "environment_relationship": "relationship to surroundings",
        "additional_notes": "any other relevant details"
    }},
    "confidence_score": 0.0-1.0,
    "analysis_notes": "any additional important notes"
}}

Be specific and accurate. If certain information cannot be determined from the image, state that clearly."""

        try:
            # Use higher max_tokens for comprehensive analysis (default is 500, we need more)
            result = self.client.query_json(prompt, [image_path], max_tokens=2000)
            
            # Add metadata to result
            result['object_id'] = object_id
            result['current_label'] = label
            result['detection_confidence'] = confidence
            result['image_path'] = str(image_path)
            
            # Add classification result
            result['object_classification'] = classification
            result['is_architectural_interior'] = is_architectural
            result['analysis_type'] = 'architectural' if is_architectural else 'general'
            
            # Add original label if it was corrected
            if original_label:
                result['original_label'] = original_label
                result['was_corrected'] = True
            else:
                result['was_corrected'] = False
            
            # Add verification information if available
            if verification:
                result['verification_info'] = verification
            
            # Add 3D position data
            if direction:
                result['has_3d_position'] = True
                result['direction'] = direction
            else:
                result['has_3d_position'] = False
            
            return result
            
        except json.JSONDecodeError as e:
            # JSON parsing failed - likely response was truncated
            raise Exception(
                f"JSON parsing failed: {str(e)}\n"
                f"This usually means the response was truncated. Try increasing max_tokens.\n"
                f"Object: {object_id}, Label: {label}"
            )
        except Exception as e:
            raise Exception(f"Analysis failed for {object_id} ({label}): {str(e)}")
    
    def _process_single_detection(self, object_id: str, obj_data: Dict) -> Tuple[str, Dict, bool]:
        """
        Process a single detection (for parallel execution)
        
        Args:
            object_id: Object ID
            obj_data: Object data dictionary
            
        Returns:
            Tuple of (object_id, analysis_result, success)
        """
        # Find corresponding image
        # Try multiple possible paths:
        # 1. YOLO visualization: yolo_frame_{object_id}.jpg
        # 2. Keyframe image: {object_id}.jpg
        # 3. Cropped images: {object_id}.jpg
        
        possible_paths = [
            self.images_dir / f"yolo_frame_{object_id}.jpg",  # YOLO detections folder format
            self.images_dir / f"{object_id}.jpg",              # Regular keyframes
            self.images_dir / f"{object_id}.jpeg",
            self.images_dir / f"{object_id}.png",
        ]
        
        image_path = None
        for path in possible_paths:
            if path.exists():
                image_path = path
                break
        
        if image_path is None:
            with self.progress_lock:
                print(f"\n⚠ Image not found for object {object_id}")
            return object_id, {
                'object_id': object_id,
                'label': obj_data.get('label', 'unknown'),
                'error': 'Image file not found',
                'analysis': None
            }, False
        
        # Analyze detection with retry logic
        with self.progress_lock:
            label = obj_data.get('label', 'unknown')
            confidence = obj_data.get('confidence', 0.0)
            print(f"\n🔍 Analyzing {object_id}: {label} (conf: {confidence:.3f}) - Classifying & analyzing...")
        
        analysis_result = self.analyze_detection_with_retry(object_id, obj_data, image_path)
        
        success = 'error' not in analysis_result
        
        if success:
            with self.progress_lock:
                print(f"  ✓ Analysis complete for {object_id}")
        else:
            with self.progress_lock:
                print(f"  ❌ Analysis failed for {object_id}: {analysis_result.get('error', 'Unknown error')}")
        
        # Update progress bar
        if self.progress_bar:
            self.progress_bar.update(1)
        
        return object_id, analysis_result, success
    
    def analyze_all_detections(self) -> Dict:
        """
        Analyze all detections using parallel processing
        
        Returns:
            Dictionary with analysis results and statistics
        """
        print("="*70)
        print("DETECTION ANALYSIS - QWEN VLM ARCHITECTURAL ANALYSIS")
        print("="*70)
        print(f"\nAnalyzing {len(self.label_data)} detected objects...\n")
        print(f"⚡ Using {self.max_parallel} parallel workers")
        print(f"🔄 Max retries: {self.max_retries} with exponential backoff\n")
        
        analysis_results = {}
        stats = {
            'total': len(self.label_data),
            'successful': 0,
            'failed': 0,
            'by_category': {},
            'architectural_count': 0,
            'general_count': 0
        }
        
        # Create progress bar
        self.progress_bar = tqdm(total=len(self.label_data), desc="Processing detections", position=0)
        
        # Process detections in parallel
        with ThreadPoolExecutor(max_workers=self.max_parallel) as executor:
            # Submit all tasks
            futures = {}
            for object_id, obj_data in self.label_data.items():
                future = executor.submit(
                    self._process_single_detection,
                    object_id,
                    obj_data
                )
                futures[future] = object_id
            
            # Collect results as they complete
            for future in as_completed(futures):
                try:
                    object_id, analysis_result, success = future.result()
                    
                    # Store analysis result
                    analysis_results[object_id] = analysis_result
                    
                    # Update statistics
                    if success:
                        stats['successful'] += 1
                        
                        # Track architectural vs general
                        if analysis_result.get('is_architectural_interior', False):
                            stats['architectural_count'] += 1
                            # Track by category for architectural objects
                            category = analysis_result.get('architectural_context', {}).get('category', 'unknown')
                            stats['by_category'][category] = stats['by_category'].get(category, 0) + 1
                        else:
                            stats['general_count'] += 1
                    else:
                        stats['failed'] += 1
                        
                except Exception as e:
                    object_id = futures[future]
                    with self.progress_lock:
                        print(f"\n❌ Error processing {object_id}: {e}")
                    stats['failed'] += 1
                    if self.progress_bar:
                        self.progress_bar.update(1)
        
        # Close progress bar
        if self.progress_bar:
            self.progress_bar.close()
            self.progress_bar = None
        
        # Print summary
        print(f"\n{'='*70}")
        print("ANALYSIS COMPLETE")
        print(f"{'='*70}")
        print(f"Total objects: {stats['total']}")
        print(f"Successful: {stats['successful']}")
        print(f"Failed: {stats['failed']}")
        print(f"\n🏛️ Object Type Classification:")
        print(f"  Architectural/Interior/Furniture: {stats['architectural_count']}")
        print(f"  General Objects: {stats['general_count']}")
        
        if stats['by_category']:
            print(f"\n📊 Architectural Objects by Category:")
            for category, count in sorted(stats['by_category'].items(), key=lambda x: x[1], reverse=True):
                print(f"  {category}: {count}")
        
        return {
            'analyses': analysis_results,
            'stats': stats
        }
    
    def save_analyses(self, results: Dict, save_individual: bool = True, 
                     save_combined: bool = True):
        """
        Save analysis results to JSON files
        
        Args:
            results: Analysis results dictionary
            save_individual: Save individual JSON file per detection
            save_combined: Save combined JSON file with all analyses
        """
        print(f"\n{'='*70}")
        print("SAVING ANALYSIS RESULTS")
        print(f"{'='*70}")
        
        analyses = results.get('analyses', {})
        
        # Save individual files per detection
        if save_individual:
            individual_dir = self.output_dir / "individual_analyses"
            individual_dir.mkdir(parents=True, exist_ok=True)
            
            print(f"\nSaving individual analysis files to: {individual_dir}")
            
            for object_id, analysis in analyses.items():
                output_file = individual_dir / f"{object_id}_analysis.json"
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(analysis, f, indent=4)
            
            print(f"✓ Saved {len(analyses)} individual analysis files")
        
        # Save combined file with all analyses
        if save_combined:
            combined_file = self.output_dir / "all_detections_analysis.json"
            print(f"\nSaving combined analysis file to: {combined_file}")
            
            with open(combined_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=4)
            
            file_size = combined_file.stat().st_size / 1024
            print(f"✓ Saved combined analysis: {combined_file} ({file_size:.1f} KB)")
        
        # Save summary statistics
        stats_file = self.output_dir / "analysis_statistics.json"
        print(f"\nSaving statistics to: {stats_file}")
        
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump(results.get('stats', {}), f, indent=4)
        
        print(f"✓ Saved statistics: {stats_file}")
        
        # Create readable summary report
        report_file = self.output_dir / "analysis_summary.txt"
        print(f"\nGenerating summary report: {report_file}")
        
        with open(report_file, 'w', encoding='utf-8') as f:
            stats = results.get('stats', {})
            
            f.write("="*70 + "\n")
            f.write("DETECTION ANALYSIS SUMMARY\n")
            f.write("="*70 + "\n\n")
            
            f.write(f"Total Detections: {stats.get('total', 0)}\n")
            f.write(f"Successful Analyses: {stats.get('successful', 0)}\n")
            f.write(f"Failed Analyses: {stats.get('failed', 0)}\n\n")
            
            f.write("Object Type Classification:\n")
            f.write("-" * 40 + "\n")
            f.write(f"  Architectural/Interior/Furniture: {stats.get('architectural_count', 0)}\n")
            f.write(f"  General Objects: {stats.get('general_count', 0)}\n\n")
            
            if stats.get('by_category'):
                f.write("Architectural Objects by Category:\n")
                f.write("-" * 40 + "\n")
                for category, count in sorted(stats['by_category'].items(), 
                                             key=lambda x: x[1], reverse=True):
                    f.write(f"  {category}: {count}\n")
                f.write("\n")
            
            f.write("\nDetailed Object Analyses:\n")
            f.write("=" * 70 + "\n\n")
            
            for object_id, analysis in sorted(analyses.items()):
                if 'error' in analysis:
                    f.write(f"Object ID: {object_id}\n")
                    f.write(f"Label: {analysis.get('label', 'unknown')}\n")
                    f.write(f"Error: {analysis.get('error', 'Unknown error')}\n")
                    f.write("-" * 70 + "\n\n")
                    continue
                
                f.write(f"Object ID: {object_id}\n")
                f.write(f"Current Label: {analysis.get('current_label', 'unknown')}\n")
                f.write(f"Analysis Type: {analysis.get('analysis_type', 'N/A').upper()}\n")
                
                # Show classification
                classification = analysis.get('object_classification', {})
                f.write(f"Classification: {classification.get('category', 'N/A')}\n")
                
                # Show original label if it was corrected
                if analysis.get('was_corrected', False):
                    f.write(f"Original Label: {analysis.get('original_label', 'N/A')} (corrected)\n")
                
                # Show verification info if available
                if 'verification_info' in analysis:
                    verification = analysis['verification_info']
                    f.write(f"Verification: {verification.get('reasoning', 'N/A')}\n")
                
                f.write(f"Detection Confidence: {analysis.get('detection_confidence', 0.0):.3f}\n")
                f.write(f"Verified Label (from analysis): {analysis.get('object_identification', {}).get('verified_label', 'N/A')}\n")
                f.write(f"Category: {analysis.get('architectural_context', {}).get('category', 'N/A')}\n")
                f.write(f"Style: {analysis.get('style_design', {}).get('design_style', 'N/A')}\n")
                f.write(f"Materials: {', '.join(analysis.get('material_finish', {}).get('primary_materials', ['N/A']))}\n")
                f.write(f"Condition: {analysis.get('condition_maintenance', {}).get('visible_condition', 'N/A')}\n")
                f.write(f"3D Position: {'Available' if analysis.get('has_3d_position', False) else 'Not available'}\n")
                f.write("-" * 70 + "\n\n")
        
        print(f"✓ Generated summary report: {report_file}")
        print(f"\n{'='*70}")
        print("ALL FILES SAVED SUCCESSFULLY")
        print(f"{'='*70}\n")


def main():
    """Main analysis script"""
    # ==========================================================================
    # CONFIGURATION - Edit these paths for your dataset
    # ==========================================================================
    
    # Path to label_positions_refined.json (or label_positions.json)
    LABEL_POSITIONS_PATH = r"C:\Users\yashw\Desktop\simon\WebCloudRenderer\MainMainMainMain_FinalMain\ConferenceRoom02\ConferenceRoom02\label_positions_refined.json"
    
    # Directory containing detection images
    # Options:
    # 1. YOLO detection visualizations (with bounding boxes drawn)
    # 2. Keyframe images: "...keyframes\images"
    # 3. Cropped tight: "...output\crops_tight"
    # 4. Cropped padded: "...output\crops_padded"
    IMAGES_DIR = r"C:\Users\yashw\Desktop\simon\WebCloudRenderer\MainMainMainMain_FinalMain\ConferenceRoom02\ConferenceRoom02\output\visualizations\yolo_detections"
    
    # Output directory for analysis results
    OUTPUT_DIR = r"C:\Users\yashw\Desktop\simon\WebCloudRenderer\MainMainMainMain_FinalMain\ConferenceRoom02\ConferenceRoom02\output\qwen_analysis"
    
    # VLM model to use (default: Qwen VL)
    MODEL = "qwen/qwen-2-vl-7b-instruct"
    
    # Parallel processing settings
    MAX_PARALLEL = 10  # Number of concurrent API requests (minimum 10 for efficiency)
    MAX_RETRIES = 3    # Retry attempts per detection with exponential backoff
    
    # Note: The script uses max_tokens=2000 for comprehensive analysis responses
    # to avoid JSON truncation errors. Default VLM max_tokens (500) is too low.
    
    # ==========================================================================
    # END CONFIGURATION
    # ==========================================================================
    
    print("\n" + "="*70)
    print("QWEN VLM DETECTION ANALYZER")
    print("="*70)
    print(f"\nConfiguration:")
    print(f"  Label positions: {LABEL_POSITIONS_PATH}")
    print(f"  Images directory: {IMAGES_DIR}")
    print(f"  Output directory: {OUTPUT_DIR}")
    print(f"  VLM Model: {MODEL}")
    print(f"  Parallel workers: {MAX_PARALLEL}")
    print(f"  Max retries: {MAX_RETRIES}")
    
    # Validate paths
    if not Path(LABEL_POSITIONS_PATH).exists():
        print(f"\n❌ ERROR: Label positions file not found: {LABEL_POSITIONS_PATH}")
        print("Please update LABEL_POSITIONS_PATH in the script.")
        return
    
    if not Path(IMAGES_DIR).exists():
        print(f"\n❌ ERROR: Images directory not found: {IMAGES_DIR}")
        print("Please update IMAGES_DIR in the script.")
        return
    
    # Initialize analyzer
    try:
        analyzer = DetectionAnalyzer(
            label_positions_path=Path(LABEL_POSITIONS_PATH),
            images_dir=Path(IMAGES_DIR),
            output_dir=Path(OUTPUT_DIR),
            model=MODEL,
            max_parallel=MAX_PARALLEL,
            max_retries=MAX_RETRIES
        )
    except Exception as e:
        print(f"\n❌ ERROR: Failed to initialize analyzer: {e}")
        return
    
    # Run analysis
    try:
        results = analyzer.analyze_all_detections()
    except Exception as e:
        print(f"\n❌ ERROR: Analysis failed: {e}")
        return
    
    # Save results
    try:
        analyzer.save_analyses(
            results, 
            save_individual=True,  # Save individual JSON per detection
            save_combined=True     # Save combined JSON with all analyses
        )
    except Exception as e:
        print(f"\n❌ ERROR: Failed to save results: {e}")
        return
    
    print("\n✓ Detection analysis complete!")


if __name__ == "__main__":
    main()

