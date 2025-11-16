import {QdrantClient} from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const COLLECTION = "prod";

async function pullCollection() {
    try {
        const pointId = 39;
        console.log(`\n=== Retrieving Point ID ${pointId} from Collection: ${COLLECTION} ===\n`);
        
        // Retrieve specific point
        const result = await client.retrieve(COLLECTION, {
            ids: [pointId],
            with_payload: true,
            with_vector: false,
        });
        
        if (result.length === 0) {
            console.log(`Point ID ${pointId} not found in collection.`);
            return null;
        }
        
        const point = result[0];
        
        console.log(`Point ID: ${point.id}\n`);
        console.log('=== All Attributes ===\n');
        console.log(JSON.stringify(point.payload, null, 2));
        
        return point;
    } catch (err) {
        console.error('Error retrieving point:', err);
        throw err;
    }
}

// Run it
pullCollection()
    .then(() => {
        console.log('Done!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Failed:', err);
        process.exit(1);
    });

