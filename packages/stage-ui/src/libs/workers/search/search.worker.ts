import { env, pipeline } from '@huggingface/transformers'
import { create, getByID, insert, load, save, search } from '@orama/orama'

// Suppress noisy ONNX Runtime warnings
env.backends.onnx.logLevel = 'error'

let db: any = null
let embedder: any = null
const MODEL_ID = 'Xenova/bge-small-en-v1.5'

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', MODEL_ID, {
      device: 'webgpu', // Try webgpu first
    })
  }
  return embedder
}

async function initDb(snapshot?: any) {
  if (db && !snapshot)
    return db

  if (snapshot) {
    db = await create({
      schema: {
        who: 'string',
        what: 'string',
        fact: 'string',
        kind: 'string',
        source: 'string',
        timestamp: 'string',
        embedding: 'vector[384]',
      },
    })
    await load(db, snapshot)
  }
  else {
    db = await create({
      schema: {
        who: 'string',
        what: 'string',
        fact: 'string',
        kind: 'string',
        source: 'string',
        timestamp: 'string',
        embedding: 'vector[384]',
      },
    })
  }
  return db
}

async function getVector(text: string) {
  const extractor = await getEmbedder()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as number[])
}

globalThis.addEventListener('message', async (e) => {
  const { type, payload, id } = e.data

  try {
    switch (type) {
      case 'init': {
        await initDb(payload?.snapshot)
        globalThis.postMessage({ id, type: 'ready' })
        break
      }

      case 'index': {
        await initDb()
        const { documents } = payload
        let indexedCount = 0
        for (const doc of documents) {
          // Skip if already exists to avoid Orama duplicate ID error
          const exists = await getByID(db, doc.id)
          if (exists)
            continue

          const vector = await getVector(doc.fact || doc.what)
          await insert(db, { ...doc, embedding: vector })
          indexedCount++
        }
        globalThis.postMessage({ id, type: 'indexed', count: indexedCount })
        break
      }

      case 'search': {
        await initDb()
        const { query, limit = 10 } = payload
        const queryVector = await getVector(query)

        const results = await search(db, {
          term: query,
          mode: 'hybrid',
          vector: {
            property: 'embedding',
            value: queryVector,
          },
          limit,
          similarity: 0.3,
        })

        globalThis.postMessage({ id, type: 'results', results })
        break
      }

      case 'persist': {
        if (!db)
          throw new Error('DB not initialized')
        const snapshot = await save(db)
        globalThis.postMessage({ id, type: 'snapshot', snapshot })
        break
      }
    }
  }
  catch (err) {
    globalThis.postMessage({
      id,
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
})
