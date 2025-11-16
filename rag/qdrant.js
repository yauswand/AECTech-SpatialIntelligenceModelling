import {QdrantClient} from '@qdrant/js-client-rest';
import OpenAI from "openai";
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
  
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const COLLECTION = "dummy";
const EMBED_DIM = 1536; // text-embedding-3-small

const obj = {
    "id": 1,
    "name": "chair",
    "dimensions": { "width": 0.5, "height": 0.9, "depth": 0.5 },
    "material": "wood",
    "color": "brown",
    "room": "living room",
    "extra": "near the window",
    "source": "video1.mp4",
    "frame_index": 123
  }

const obj2 = {
    "id": 2,
    "name": "table",
    "dimensions": { "width": 1.2, "height": 0.75, "depth": 0.8 },
    "material": "glass",
    "color": "transparent",
    "room": "dining room",
    "extra": "center of the room",
    "source": "video1.mp4",
    "frame_index": 245
  }

const obj3 = {
    "id": 3,
    "name": "sofa",
    "dimensions": { "width": 2.0, "height": 0.85, "depth": 0.9 },
    "material": "fabric",
    "color": "gray",
    "room": "living room",
    "extra": "against the wall",
    "source": "video2.mp4",
    "frame_index": 67
  }

const obj4 = {
    "id": 4,
    "name": "lamp",
    "dimensions": { "width": 0.3, "height": 1.5, "depth": 0.3 },
    "material": "metal",
    "color": "black",
    "room": "bedroom",
    "extra": "on the nightstand",
    "source": "video2.mp4",
    "frame_index": 189
  }

const obj5 = {
    "id": 5,
    "name": "bookshelf",
    "dimensions": { "width": 1.0, "height": 1.8, "depth": 0.4 },
    "material": "wood",
    "color": "white",
    "room": "study",
    "extra": "filled with books",
    "source": "video3.mp4",
    "frame_index": 312
  }

const obj6 = {
    "id": 6,
    "name": "sofa",
    "dimensions": { "width": 1.8, "height": 0.9, "depth": 0.85 },
    "material": "leather",
    "color": "brown",
    "room": "office",
    "extra": "facing the desk",
    "source": "video3.mp4",
    "frame_index": 156
  }

const obj7 = {
    "id": 7,
    "name": "chair",
    "dimensions": { "width": 0.55, "height": 1.0, "depth": 0.55 },
    "material": "plastic",
    "color": "white",
    "room": "kitchen",
    "extra": "around the kitchen table",
    "source": "video1.mp4",
    "frame_index": 378
  }

const obj8 = {
    "id": 8,
    "name": "chair",
    "dimensions": { "width": 0.6, "height": 1.1, "depth": 0.6 },
    "material": "metal",
    "color": "silver",
    "room": "dining room",
    "extra": "next to the table",
    "source": "video1.mp4",
    "frame_index": 289
  }

async function uploadObject(obj) {
    try {
        // Ensure collection exists
        await ensureCollection();
        
        // Convert object to text
        const text = objectToText(obj);
        console.log('Converted object to text:', text);
        
        // Embed the text
        const embedding = await embedText(text);
        console.log('Generated embedding, dimension:', embedding.length);
        
        // Create payload
        const payload = objectToPayload(obj);
        
        // Upload to Qdrant
        const result = await client.upsert(COLLECTION, {
            wait: true,
            points: [
                {
                    id: obj.id,
                    vector: embedding,
                    payload: payload
                }
            ]
        });
        
        console.log('Successfully uploaded object to Qdrant:', result);
        return result;
    } catch (err) {
        console.error('Error uploading object:', err);
        throw err;
    }
}

// Main execution
(async () => {
    try {
        const objects = [obj, obj2, obj3, obj4, obj5, obj6, obj7, obj8];
        for (const objToUpload of objects) {
            await uploadObject(objToUpload);
        }
        await listCollection();
    } catch (err) {
        console.error('Failed to upload objects:', err);
        process.exit(1);
    }
})();


function objectToText(obj) {
    const dims = obj.dimensions || {};
    const dimStr = `${dims.width ?? "?"}m W x ${dims.height ?? "?"}m H x ${
      dims.depth ?? "?"
    }m D`;
  
    return [
      `${(obj.name || "object").toString().toLowerCase()} in the ${
        obj.room || "room"
      }`,
      `Material: ${obj.material || "unknown"}`,
      `Color: ${obj.color || "unknown"}`,
      `Dimensions: ${dimStr}`,
      `Notes: ${obj.extra || "none"}`,
    ].join(". ") + ".";
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

  function objectToPayload(obj) {
    const dims = obj.dimensions || {};
  
    return {
      id: obj.id,
      name: obj.name,
      room: obj.room,
      material: obj.material,
      color: obj.color,
      width: dims.width,
      height: dims.height,
      depth: dims.depth,
      confidence: obj.confidence,
      source: obj.source,
      frame_index: obj.frame_index,
      description: objectToText(obj), // keep text version in payload too
    };
}

async function listCollection() {
    try {
        const result = await client.scroll(COLLECTION, {
            limit: 100, // Adjust limit as needed
            with_payload: true,
            with_vector: false, // Set to true if you want to see vectors
        });
        
        console.log(`\n=== Collection: ${COLLECTION} ===`);
        console.log(`Total points found: ${result.points.length}`);
        
        if (result.points.length === 0) {
            console.log('Collection is empty.');
            return result;
        }
        
        console.log('\nPoints in collection:');
        result.points.forEach((point, index) => {
            console.log(`\n[${index + 1}] Point ID: ${point.id}`);
            console.log('Payload:', JSON.stringify(point.payload, null, 2));
        });
        
        return result;
    } catch (err) {r
        console.error('Error listing collection:', err);
        throw err;
    }
}
  