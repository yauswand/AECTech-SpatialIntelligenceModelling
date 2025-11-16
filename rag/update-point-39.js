import {QdrantClient} from '@qdrant/js-client-rest';
import OpenAI from "openai";
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const COLLECTION = "prod";
const EMBED_DIM = 1536; // text-embedding-3-small
const POINT_ID = 39;

// Conference Room Spatial Report — Detailed Narrative
const CONFERENCE_ROOM_NARRATIVE = `Conference Room Spatial Report — Detailed Narrative
This report presents a comprehensive spatial analysis of a conference room located at 95 Trinity Place, New York, NY. All measurements and calculations are based on data captured and exported via Polycam on November 16, 2025. The report uses the metric system and summarizes architectural geometry, volumetric data, furniture inventory, and openings within the space.

1. Location & Metadata
The conference room is situated at the above address with geographical coordinates of 40.708775° N latitude and –74.011764° W longitude. The site sits approximately 81 meters above sea level.
Data for this report was captured and processed using Polycam, and the original capture can be referenced through the following link:
https://poly.cam/capture/E33C742B-2532-4F77-823D-5824381E0FA1
The PDF generated from the scan spans five pages and includes dimensional calculations, images, and detected furnishings (images excluded in this summary).
A standard disclaimer clarifies that all measurements are estimates and should be verified independently before use in construction, renovation, or project execution.

2. Global Spatial Overview
The conference room and its surrounding structure produce the following global metrics:
Total exterior floor area: 34.0 m²
Total livable floor area: 32.2 m²
Total wall area: 38.9 m²
Total window area: 0.0 m² (no windows detected)
Total room volume: 84.81 m³
These values express the usable interior geometry and enclosure of the space.

3. Space Overview — Conference Room
The primary space analyzed is a 32.2 m² conference room, with a visually labeled area of 32.0 m² on the floor plan.

3.1 Dimensions
Bounding box dimensions:
Length: 6.3 m
Width: 5.3 m
Inscribed dimensions:
Length: 6.3 m
Width: 4.4 m`;

async function embedText(text) {
    const resp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });
    return resp.data[0].embedding;
}

async function updatePoint39() {
    try {
        console.log(`\n=== Updating Point ID ${POINT_ID} in Collection: ${COLLECTION} ===\n`);
        
        // Generate embedding for the narrative
        console.log('Generating embedding for narrative text...');
        const embedding = await embedText(CONFERENCE_ROOM_NARRATIVE);
        console.log(`Embedding generated, dimension: ${embedding.length}`);
        
        // Create payload for point 39
        const payload = {
            document_type: 'spatial_report_narrative',
            report_title: 'Conference Room Spatial Report',
            space_name: 'Conference Room',
            location: {
                address: '95 Trinity Pl, New York, NY',
                latitude_deg: 40.708775,
                longitude_deg: -74.011764,
                altitude_m: 81
            },
            metadata: {
                report_exported_on: '2025-11-16',
                space_captured_on: '2025-11-16',
                capture_url: 'https://poly.cam/capture/E33C742B-2532-4F77-823D-5824381E0FA1',
                source_application: 'Polycam',
                document_page_count: 5
            },
            narrative_text: CONFERENCE_ROOM_NARRATIVE,
            description: CONFERENCE_ROOM_NARRATIVE,
            // Reference to lines 1000-1033 in source file
            source_reference: 'bash (1000-1033)',
        };
        
        // Upsert point 39
        console.log('Uploading to Qdrant...');
        const result = await client.upsert(COLLECTION, {
            wait: true,
            points: [
                {
                    id: POINT_ID,
                    vector: embedding,
                    payload: payload
                }
            ]
        });
        
        console.log(`\n✅ Successfully updated Point ID ${POINT_ID}`);
        console.log(`\nPoint 39 is now configured for questions relating to the Conference Room Spatial Report narrative.`);
        
        return result;
    } catch (err) {
        console.error('Error updating point:', err);
        throw err;
    }
}

// Run it
updatePoint39()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Failed:', err);
        process.exit(1);
    });

