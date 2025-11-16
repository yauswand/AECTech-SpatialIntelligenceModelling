import {QdrantClient} from '@qdrant/js-client-rest';
import OpenAI from "openai";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '../.env' });
  
const openai = new OpenAI({
  apiKey: process.env.VITE_OPENAI_API_KEY,
});

const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const COLLECTION = "prod";
const EMBED_DIM = 1536; // text-embedding-3-small
const ANALYSIS_DIR = path.join(__dirname, '../qwen_analysis/individual_analyses');

/**
 * Extract frame ID from filename (e.g., "2350577717505_analysis.json" -> "2350577717505")
 */
function extractFrameId(filename) {
    const match = filename.match(/^(\d+)_analysis\.json$/);
    return match ? match[1] : null;
}

/**
 * Read all analysis JSON files from the directory
 */
function getAllAnalysisFiles() {
    try {
        const files = fs.readdirSync(ANALYSIS_DIR);
        return files
            .filter(file => file.endsWith('_analysis.json'))
            .map(file => ({
                filename: file,
                filepath: path.join(ANALYSIS_DIR, file),
                frameId: extractFrameId(file)
            }))
            .filter(item => item.frameId !== null);
    } catch (err) {
        console.error('Error reading analysis directory:', err);
        throw err;
    }
}

/**
 * Load and parse a single analysis JSON file
 */
function loadAnalysisFile(filepath) {
    try {
        const content = fs.readFileSync(filepath, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`Error loading file ${filepath}:`, err);
        throw err;
    }
}

/**
 * Convert analysis object to comprehensive text for embedding
 */
function analysisToText(analysis, frameId) {
    const parts = [];
    
    // Frame and object identification
    parts.push(`Frame ID: ${frameId}`);
    if (analysis.current_label) parts.push(`Label: ${analysis.current_label}`);
    if (analysis.object_id) parts.push(`Object ID: ${analysis.object_id}`);
    
    // Object identification
    if (analysis.object_identification) {
        const objId = analysis.object_identification;
        if (objId.verified_label) parts.push(`Verified label: ${objId.verified_label}`);
        if (objId.specific_type) parts.push(`Specific type: ${objId.specific_type}`);
        if (objId.distinctive_features && objId.distinctive_features.length > 0) {
            parts.push(`Distinctive features: ${objId.distinctive_features.join(', ')}`);
        }
    }
    
    // Architectural context
    if (analysis.architectural_context) {
        const arch = analysis.architectural_context;
        if (arch.category) parts.push(`Category: ${arch.category}`);
        if (arch.typical_location) parts.push(`Typical location: ${arch.typical_location}`);
        if (arch.architectural_style) parts.push(`Architectural style: ${arch.architectural_style}`);
        if (arch.functional_role) parts.push(`Functional role: ${arch.functional_role}`);
    }
    
    // Spatial analysis
    if (analysis.spatial_analysis) {
        const spatial = analysis.spatial_analysis;
        if (spatial.size_scale) parts.push(`Size scale: ${spatial.size_scale}`);
        if (spatial.orientation) parts.push(`Orientation: ${spatial.orientation}`);
        if (spatial.relationship_to_space) parts.push(`Relationship to space: ${spatial.relationship_to_space}`);
        if (spatial.placement) parts.push(`Placement: ${spatial.placement}`);
    }
    
    // Material and finish
    if (analysis.material_finish) {
        const mat = analysis.material_finish;
        if (mat.primary_materials && mat.primary_materials.length > 0) {
            parts.push(`Primary materials: ${mat.primary_materials.join(', ')}`);
        }
        if (mat.quality_level) parts.push(`Quality level: ${mat.quality_level}`);
        if (mat.surface_finish) parts.push(`Surface finish: ${mat.surface_finish}`);
        if (mat.color_palette && mat.color_palette.length > 0) {
            parts.push(`Color palette: ${mat.color_palette.join(', ')}`);
        }
    }
    
    // Style and design
    if (analysis.style_design) {
        const style = analysis.style_design;
        if (style.design_style) parts.push(`Design style: ${style.design_style}`);
        if (style.design_era) parts.push(`Design era: ${style.design_era}`);
        if (style.aesthetic_qualities && style.aesthetic_qualities.length > 0) {
            parts.push(`Aesthetic qualities: ${style.aesthetic_qualities.join(', ')}`);
        }
        if (style.design_complexity) parts.push(`Design complexity: ${style.design_complexity}`);
    }
    
    // Condition and maintenance
    if (analysis.condition_maintenance) {
        const cond = analysis.condition_maintenance;
        if (cond.visible_condition) parts.push(`Visible condition: ${cond.visible_condition}`);
        if (cond.cleanliness) parts.push(`Cleanliness: ${cond.cleanliness}`);
        if (cond.wear_damage) parts.push(`Wear/damage: ${cond.wear_damage}`);
    }
    
    // Functional analysis
    if (analysis.functional_analysis) {
        const func = analysis.functional_analysis;
        if (func.primary_function) parts.push(`Primary function: ${func.primary_function}`);
        if (func.usage_context) parts.push(`Usage context: ${func.usage_context}`);
        if (func.ergonomic_notes) parts.push(`Ergonomic notes: ${func.ergonomic_notes}`);
        if (func.functionality) parts.push(`Functionality: ${func.functionality}`);
    }
    
    // Decorative elements
    if (analysis.decorative_elements) {
        const decor = analysis.decorative_elements;
        if (decor.features && decor.features.length > 0) {
            parts.push(`Decorative features: ${decor.features.join(', ')}`);
        }
        if (decor.visual_weight) parts.push(`Visual weight: ${decor.visual_weight}`);
        if (decor.aesthetic_contribution) parts.push(`Aesthetic contribution: ${decor.aesthetic_contribution}`);
        if (decor.coordination) parts.push(`Coordination: ${decor.coordination}`);
    }
    
    // Quality and value
    if (analysis.quality_value) {
        const quality = analysis.quality_value;
        if (quality.build_quality) parts.push(`Build quality: ${quality.build_quality}`);
        if (quality.value_category) parts.push(`Value category: ${quality.value_category}`);
        if (quality.craftsmanship) parts.push(`Craftsmanship: ${quality.craftsmanship}`);
    }
    
    // Contextual notes
    if (analysis.contextual_notes) {
        const context = analysis.contextual_notes;
        if (context.unique_characteristics && context.unique_characteristics.length > 0) {
            parts.push(`Unique characteristics: ${context.unique_characteristics.join(', ')}`);
        }
        if (context.additional_observations && context.additional_observations.length > 0) {
            parts.push(`Additional observations: ${context.additional_observations.join('; ')}`);
        }
    }
    
    // Analysis notes and confidence
    if (analysis.analysis_notes) parts.push(`Analysis notes: ${analysis.analysis_notes}`);
    if (analysis.confidence_score !== undefined) parts.push(`Confidence score: ${analysis.confidence_score}`);
    if (analysis.detection_confidence !== undefined) parts.push(`Detection confidence: ${analysis.detection_confidence}`);
    
    // Object classification
    if (analysis.object_classification) {
        const classif = analysis.object_classification;
        if (classif.category) parts.push(`Classification category: ${classif.category}`);
        if (classif.reasoning) parts.push(`Classification reasoning: ${classif.reasoning}`);
    }
    
    // Verification info
    if (analysis.verification_info) {
        const verify = analysis.verification_info;
        if (verify.reasoning) parts.push(`Verification reasoning: ${verify.reasoning}`);
    }
    
    return parts.join('. ') + '.';
}

/**
 * Convert analysis object to payload for Qdrant
 */
function analysisToPayload(analysis, frameId) {
    return {
        frame_id: frameId,
        object_id: analysis.object_id || null,
        current_label: analysis.current_label || null,
        confidence_score: analysis.confidence_score || null,
        detection_confidence: analysis.detection_confidence || null,
        analysis_type: analysis.analysis_type || null,
        is_architectural_interior: analysis.is_architectural_interior || false,
        has_3d_position: analysis.has_3d_position || false,
        was_corrected: analysis.was_corrected || false,
        image_path: analysis.image_path || null,
        // Include all major sections
        object_identification: analysis.object_identification || null,
        architectural_context: analysis.architectural_context || null,
        spatial_analysis: analysis.spatial_analysis || null,
        material_finish: analysis.material_finish || null,
        style_design: analysis.style_design || null,
        condition_maintenance: analysis.condition_maintenance || null,
        functional_analysis: analysis.functional_analysis || null,
        decorative_elements: analysis.decorative_elements || null,
        quality_value: analysis.quality_value || null,
        contextual_notes: analysis.contextual_notes || null,
        object_classification: analysis.object_classification || null,
        verification_info: analysis.verification_info || null,
        direction: analysis.direction || null,
        // Keep full text description in payload
        description: analysisToText(analysis, frameId),
    };
}

/**
 * Convert spatial report object to comprehensive text for embedding
 */
function spatialReportToText(report) {
    const parts = [];
    
    // Report metadata
    if (report.report_title) parts.push(`Report Title: ${report.report_title}`);
    if (report.space_name) parts.push(`Space Name: ${report.space_name}`);
    
    // Location information
    if (report.location) {
        const loc = report.location;
        if (loc.address) parts.push(`Location: ${loc.address}`);
        if (loc.latitude_deg !== undefined) parts.push(`Latitude: ${loc.latitude_deg}° N`);
        if (loc.longitude_deg !== undefined) parts.push(`Longitude: ${loc.longitude_deg}° W`);
        if (loc.altitude_m !== undefined) parts.push(`Altitude: ${loc.altitude_m} meters above sea level`);
    }
    
    // Metadata
    if (report.metadata) {
        const meta = report.metadata;
        if (meta.report_exported_on) parts.push(`Report exported on: ${meta.report_exported_on}`);
        if (meta.space_captured_on) parts.push(`Space captured on: ${meta.space_captured_on}`);
        if (meta.capture_url) parts.push(`Capture URL: ${meta.capture_url}`);
        if (meta.source_application) parts.push(`Source application: ${meta.source_application}`);
        if (meta.document_page_count) parts.push(`Document page count: ${meta.document_page_count}`);
    }
    
    // Global overview
    if (report.global_overview) {
        const global = report.global_overview;
        parts.push(`Global Overview: Total exterior floor area: ${global.total_exterior_floor_area_m2} m²`);
        parts.push(`Total livable floor area: ${global.total_livable_floor_area_m2} m²`);
        parts.push(`Total wall area: ${global.total_wall_area_m2} m²`);
        parts.push(`Total window area: ${global.total_window_area_m2} m²`);
        parts.push(`Total volume: ${global.total_volume_m3} m³`);
    }
    
    // Space overview
    if (report.space_overview) {
        const space = report.space_overview;
        if (space.space_name) parts.push(`Space: ${space.space_name}`);
        if (space.floor_area_m2 !== undefined) parts.push(`Floor area: ${space.floor_area_m2} m²`);
        if (space.dimensions_bounding_box_m) {
            parts.push(`Bounding box: ${space.dimensions_bounding_box_m.length} m × ${space.dimensions_bounding_box_m.width} m`);
        }
        if (space.dimensions_inscribed_m) {
            parts.push(`Inscribed dimensions: ${space.dimensions_inscribed_m.length} m × ${space.dimensions_inscribed_m.width} m`);
        }
        if (space.wall_area_excl_openings_m2 !== undefined) parts.push(`Wall area (excluding openings): ${space.wall_area_excl_openings_m2} m²`);
        if (space.perimeter_m !== undefined) parts.push(`Perimeter: ${space.perimeter_m} m`);
        if (space.ceiling_height_min_m !== undefined && space.ceiling_height_max_m !== undefined) {
            parts.push(`Ceiling height: ${space.ceiling_height_min_m} m to ${space.ceiling_height_max_m} m`);
        }
        if (space.room_volume_m3 !== undefined) parts.push(`Room volume: ${space.room_volume_m3} m³`);
    }
    
    // Floor plan
    if (report.floor_plan) {
        const floor = report.floor_plan;
        if (floor.name) parts.push(`Floor plan: ${floor.name}`);
        if (floor.area_text_label_m2 !== undefined) parts.push(`Floor plan area: ${floor.area_text_label_m2} m²`);
        if (floor.perimeter_m !== undefined) parts.push(`Floor plan perimeter: ${floor.perimeter_m} m`);
        if (floor.edge_measurements_m && floor.edge_measurements_m.length > 0) {
            parts.push(`Edge measurements: ${floor.edge_measurements_m.join(', ')} m`);
        }
    }
    
    // Furniture
    if (report.furniture) {
        const furn = report.furniture;
        if (furn.summary_counts) {
            const counts = Object.entries(furn.summary_counts)
                .map(([type, count]) => `${type}: ${count}`)
                .join(', ');
            parts.push(`Furniture summary: ${counts}`);
        }
        if (furn.items && furn.items.length > 0) {
            const items = furn.items.map(item => 
                `Item ${item.id} (${item.type}): ${item.width_m} m × ${item.height_m} m × ${item.depth_m} m`
            ).join('; ');
            parts.push(`Furniture items: ${items}`);
        }
    }
    
    // Appliances
    if (report.appliances) {
        const app = report.appliances;
        if (app.summary_counts) {
            const counts = Object.entries(app.summary_counts)
                .map(([type, count]) => `${type}: ${count}`)
                .join(', ');
            parts.push(`Appliances summary: ${counts}`);
        }
        if (app.items && app.items.length > 0) {
            const items = app.items.map(item => 
                `Item ${item.id} (${item.type}): ${item.width_m} m × ${item.height_m} m × ${item.depth_m} m`
            ).join('; ');
            parts.push(`Appliances: ${items}`);
        }
    }
    
    // Openings
    if (report.openings) {
        const open = report.openings;
        if (open.door_summary_counts) {
            const counts = Object.entries(open.door_summary_counts)
                .map(([type, count]) => `${type}: ${count}`)
                .join(', ');
            parts.push(`Doors summary: ${counts}`);
        }
        if (open.doors && open.doors.length > 0) {
            const doors = open.doors.map(door => 
                `Door ${door.id} (${door.type}): ${door.width_m} m × ${door.height_m} m, area: ${door.area_m2} m²`
            ).join('; ');
            parts.push(`Doors: ${doors}`);
        }
        if (open.casing_settings) {
            if (open.casing_settings.window_casing_width_m !== undefined) {
                parts.push(`Window casing width: ${open.casing_settings.window_casing_width_m} m`);
            }
            if (open.casing_settings.door_casing_width_m !== undefined) {
                parts.push(`Door casing width: ${open.casing_settings.door_casing_width_m} m`);
            }
        }
        if (open.total_casing_lengths_m) {
            if (open.total_casing_lengths_m.doors !== undefined) {
                parts.push(`Total door casing length: ${open.total_casing_lengths_m.doors} m`);
            }
        }
    }
    
    // Legal disclaimer
    if (report.legal_disclaimer) {
        parts.push(`Legal disclaimer: ${report.legal_disclaimer}`);
    }
    
    return parts.join('. ') + '.';
}

/**
 * Convert spatial report object to payload for Qdrant
 */
function spatialReportToPayload(report) {
    return {
        document_type: 'spatial_report',
        report_title: report.report_title || null,
        space_name: report.space_name || null,
        location: report.location || null,
        metadata: report.metadata || null,
        global_overview: report.global_overview || null,
        space_overview: report.space_overview || null,
        floor_plan: report.floor_plan || null,
        furniture: report.furniture || null,
        appliances: report.appliances || null,
        openings: report.openings || null,
        legal_disclaimer: report.legal_disclaimer || null,
        unit_system: report.unit_system || null,
        // Keep full text description in payload
        description: spatialReportToText(report),
    };
}

async function embedText(text) {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
  
    return resp.data[0].embedding; // array of floats
}

async function ensureCollection() {
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === COLLECTION,
    );
  
    if (!exists) {
      await client.createCollection(COLLECTION, {
        vectors: {
          size: EMBED_DIM,
          distance: "Cosine",
        },
      });
  
      console.log(`Created collection: ${COLLECTION}`);
    } else {
      console.log(`Collection already exists: ${COLLECTION}`);
    }
}

async function uploadAnalysis(analysis, frameId, pointId, displayIndex) {
    try {
        // Ensure collection exists
        await ensureCollection();
        
        // Convert analysis to text
        const text = analysisToText(analysis, frameId);
        console.log(`[${displayIndex}] Frame ${frameId}: Converted to text (${text.length} chars)`);
        
        // Embed the text
        const embedding = await embedText(text);
        console.log(`[${displayIndex}] Frame ${frameId}: Generated embedding, dimension: ${embedding.length}`);
        
        // Create payload
        const payload = analysisToPayload(analysis, frameId);
        
        // Upload to Qdrant
        const result = await client.upsert(COLLECTION, {
            wait: true,
            points: [
                {
                    id: pointId,
                    vector: embedding,
                    payload: payload
                }
            ]
        });
        
        console.log(`[${displayIndex}] Frame ${frameId}: Successfully uploaded to Qdrant (point ID: ${pointId})`);
        return result;
    } catch (err) {
        console.error(`[${displayIndex}] Frame ${frameId}: Error uploading:`, err);
        throw err;
    }
}

async function uploadSpatialReport(report, pointId, displayIndex) {
    try {
        // Ensure collection exists
        await ensureCollection();
        
        // Convert report to text
        const text = spatialReportToText(report);
        const spaceName = report.space_name || 'Unknown Space';
        console.log(`[${displayIndex}] ${spaceName}: Converted to text (${text.length} chars)`);
        
        // Embed the text
        const embedding = await embedText(text);
        console.log(`[${displayIndex}] ${spaceName}: Generated embedding, dimension: ${embedding.length}`);
        
        // Create payload
        const payload = spatialReportToPayload(report);
        
        // Upload to Qdrant
        const result = await client.upsert(COLLECTION, {
            wait: true,
            points: [
                {
                    id: pointId,
                    vector: embedding,
                    payload: payload
                }
            ]
        });
        
        console.log(`[${displayIndex}] ${spaceName}: Successfully uploaded to Qdrant (point ID: ${pointId})`);
        return result;
    } catch (err) {
        console.error(`[${displayIndex}] Error uploading spatial report:`, err);
        throw err;
    }
}

async function listCollection() {
    try {
        const result = await client.scroll(COLLECTION, {
            limit: 1000, // Increased limit to see all points
            with_payload: true,
            with_vector: false, // Set to true if you want to see vectors
        });
        
        console.log(`\n=== Collection: ${COLLECTION} ===`);
        console.log(`Total points found: ${result.points.length}`);
        
        if (result.points.length === 0) {
            console.log('Collection is empty.');
            return result;
        }
        
        console.log('\nSample points in collection (first 5):');
        result.points.slice(0, 5).forEach((point, index) => {
            console.log(`\n[${index + 1}] Point ID: ${point.id}`);
            console.log(`Frame ID: ${point.payload.frame_id}`);
            console.log(`Label: ${point.payload.current_label}`);
            console.log(`Confidence: ${point.payload.confidence_score}`);
        });
        
        return result;
    } catch (err) {
        console.error('Error listing collection:', err);
        throw err;
    }
}

// Conference Room Spatial Report Data
const CONFERENCE_ROOM_REPORT = {
  "report_title": "SpatialReport",
  "space_name": "Conference Room",
  "location": {
    "address": "95 Trinity Pl, New York, NY",
    "latitude_deg": 40.708775,
    "longitude_deg": -74.011764,
    "altitude_m": 81
  },
  "metadata": {
    "report_exported_on": "2025-11-16",
    "space_captured_on": "2025-11-16",
    "capture_url": "https://poly.cam/capture/E33C742B-2532-4F77-823D-5824381E0FA1",
    "source_application": "Polycam",
    "document_page_count": 5
  },
  "legal_disclaimer": "Legal Disclaimer: The results in this report are estimates and may not perfectly reflect real-world measurements or conditions. This report is intended for informational purposes only. Users should independently verify dimensions and data for critical planning or execution. Polycam is not liable for any discrepancies or decisions made based on this report.",
  "unit_system": "metric",
  "global_overview": {
    "total_exterior_floor_area_m2": 34.0,
    "total_livable_floor_area_m2": 32.2,
    "total_wall_area_m2": 38.9,
    "total_window_area_m2": 0.0,
    "total_volume_m3": 84.81
  },
  "space_overview": {
    "space_name": "Conference Room",
    "floor_area_m2": 32.2,
    "floor_area_label_m2": 32.0,
    "dimensions_bounding_box_m": {
      "length": 6.3,
      "width": 5.3
    },
    "dimensions_inscribed_m": {
      "length": 6.3,
      "width": 4.4
    },
    "wall_area_incl_openings_m2": 49.8,
    "wall_area_excl_openings_m2": 38.9,
    "perimeter_m": 23.3,
    "ceiling_height_min_m": 2.6,
    "ceiling_height_max_m": 2.8,
    "room_volume_m3": 84.81
  },
  "floor_plan": {
    "name": "Conference Room Floor Plan",
    "area_text_label_m2": 32.0,
    "bounding_box_dimensions_m": {
      "length": 6.3,
      "width": 5.3
    },
    "inscribed_dimensions_m": {
      "length": 6.3,
      "width": 4.4
    },
    "perimeter_m": 23.3,
    "edge_measurements_m": [
      5.45,
      5.62,
      4.60,
      5.61,
      4.67,
      4.96,
      4.57,
      4.71,
      4.47,
      0.92,
      0.78,
      4.76,
      0.86,
      0.66,
      4.37,
      0.92,
      4.61,
      0.86
    ]
  },
  "furniture": {
    "summary_counts": {
      "Chair": 11,
      "Desk": 1,
      "Dining table": 1,
      "Task chair": 1
    },
    "items": [
      {
        "id": 1,
        "type": "Chair",
        "width_m": 0.6,
        "height_m": 0.8,
        "depth_m": 0.6
      },
      {
        "id": 2,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.9,
        "depth_m": 0.6
      },
      {
        "id": 3,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.9,
        "depth_m": 0.6
      },
      {
        "id": 4,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.9,
        "depth_m": 0.6
      },
      {
        "id": 5,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.9,
        "depth_m": 0.6
      },
      {
        "id": 6,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.9,
        "depth_m": 0.6
      },
      {
        "id": 7,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.9,
        "depth_m": 0.6
      },
      {
        "id": 8,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.8,
        "depth_m": 0.6
      },
      {
        "id": 9,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.9,
        "depth_m": 0.5
      },
      {
        "id": 10,
        "type": "Chair",
        "width_m": 0.5,
        "height_m": 0.7,
        "depth_m": 0.6
      },
      {
        "id": 11,
        "type": "Chair",
        "width_m": 0.4,
        "height_m": 0.8,
        "depth_m": 0.5
      },
      {
        "id": 12,
        "type": "Desk",
        "width_m": 3.7,
        "height_m": 0.7,
        "depth_m": 0.6
      },
      {
        "id": 13,
        "type": "Dining table",
        "width_m": 2.8,
        "height_m": 0.8,
        "depth_m": 1.5
      },
      {
        "id": 14,
        "type": "Task chair",
        "width_m": 0.6,
        "height_m": 1.0,
        "depth_m": 0.6
      }
    ]
  },
  "appliances": {
    "summary_counts": {
      "TV": 1
    },
    "items": [
      {
        "id": 1,
        "type": "TV",
        "width_m": 1.7,
        "height_m": 1.0,
        "depth_m": 0.11
      }
    ]
  },
  "openings": {
    "door_summary_counts": {
      "Door": 1
    },
    "doors": [
      {
        "id": 1,
        "type": "Door",
        "width_m": 4.6,
        "height_m": 2.4,
        "area_m2": 10.971
      }
    ],
    "casing_settings": {
      "window_casing_width_m": 0.04,
      "door_casing_width_m": 0.04
    },
    "total_casing_lengths_m": {
      "doors": 9.5
    }
  }
};

// Main execution
(async () => {
    try {
        console.log('Starting Qdrant upload process...');
        console.log(`Analysis directory: ${ANALYSIS_DIR}`);
        
        // Get all analysis files
        const files = getAllAnalysisFiles();
        console.log(`Found ${files.length} analysis files to process`);
        
        let pointIdCounter = 0;
        
        // Process each analysis file
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                console.log(`\nProcessing file ${i + 1}/${files.length}: ${file.filename}`);
                
                // Load the analysis JSON
                const analysis = loadAnalysisFile(file.filepath);
                
                // Upload to Qdrant
                await uploadAnalysis(analysis, file.frameId, pointIdCounter, i + 1);
                pointIdCounter++;
                
                // Small delay to avoid rate limiting
                if (i < files.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } else {
            console.log('No analysis files found. Continuing with spatial reports...');
        }
        
        // Upload spatial reports
        console.log('\n=== Uploading Spatial Reports ===');
        console.log(`Processing Conference Room spatial report...`);
        await uploadSpatialReport(CONFERENCE_ROOM_REPORT, pointIdCounter, 1);
        
        console.log('\n=== Upload Complete ===');
        await listCollection();
        
    } catch (err) {
        console.error('Failed to upload data:', err);
        process.exit(1);
    }
})();
